import "server-only";

export type WebResult = { title: string; url: string; snippet: string; site: string; image?: string; embedUrl?: string };
export type AboutPanel = { title: string; description?: string; extract: string; image?: string; url: string };
export type WorkplaceSearchResult = { ok: boolean; results?: WebResult[]; about?: AboutPanel; error?: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function cleanText(html: string) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => {
      if (code[0] === "#") return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function resultUrl(href: string) {
  const decoded = cleanText(href);
  if (/duckduckgo\.com\/l\//.test(decoded)) {
    const target = new URL(decoded, "https://duckduckgo.com").searchParams.get("uddg");
    if (target) return target;
  }
  return decoded.startsWith("//") ? `https:${decoded}` : decoded;
}

/** Web results for a short query, from DuckDuckGo's no-script page (Google offers no keyless results API). */
export async function searchWeb(query: string): Promise<WebResult[]> {
  const response = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // A full browser user agent gets DuckDuckGo's bot check instead of results.
      "User-Agent": "Mozilla/5.0",
    },
    body: new URLSearchParams({ q: query, kl: "wt-wt" }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const html = await response.text();

  const results: WebResult[] = [];
  const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/g)];
  links.forEach((link, index) => {
    const url = resultUrl(link[1]);
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) return;
    const until = links[index + 1]?.index ?? html.length;
    const snippet = /<td class='result-snippet'>([\s\S]*?)<\/td>/.exec(html.slice(link.index, until))?.[1] ?? "";
    results.push({ title: cleanText(link[2]), url, snippet: cleanText(snippet), site: new URL(url).hostname.replace(/^www\./, "") });
  });
  return results.slice(0, 10);
}

/** Whether the site lets other pages show it in a frame (no X-Frame-Options block, no restrictive frame-ancestors). */
function allowsFraming(headers: Headers) {
  if (/deny|sameorigin/i.test(headers.get("x-frame-options") ?? "")) return false;
  const ancestors = /frame-ancestors([^;]*)/i.exec(headers.get("content-security-policy") ?? "")?.[1];
  return ancestors === undefined || /(^|\s)\*(\s|$)/.test(ancestors);
}

/** The page's link-preview image and whether it can be shown inside the dialog, from one request. */
async function pageInfo(url: string): Promise<{ image?: string; embedUrl?: string }> {
  const { hostname } = new URL(url);
  if (!hostname.includes(".") || /^[\d.]+$|^\[|localhost|\.local$|\.internal$/i.test(hostname)) return {};
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PeopleApp/1.0)", Accept: "text/html" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok || !response.body || !/html/i.test(response.headers.get("content-type") ?? "")) return {};
    const embedUrl = response.url.startsWith("https:") && allowsFraming(response.headers) ? response.url : undefined;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let head = "";
    while (head.length < 150_000 && !/<\/head>/i.test(head)) {
      const { done, value } = await reader.read();
      if (done) break;
      head += decoder.decode(value, { stream: true });
    }
    void reader.cancel();
    for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
      if (!/(property|name)=["'](og:image(:secure_url)?|twitter:image(:src)?)["']/i.test(tag)) continue;
      const content = /content=["']([^"']+)["']/i.exec(tag)?.[1];
      if (!content) continue;
      const image = new URL(cleanText(content), response.url);
      if (image.protocol === "https:") return { image: image.href, embedUrl };
    }
    return { embedUrl };
  } catch {
    return {};
  }
}

/** Wikipedia's own summary of the article, used like Google's "About" panel. */
async function wikipediaAbout(url: string): Promise<AboutPanel | undefined> {
  const match = /^https:\/\/([a-z]{2,3})\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/.exec(url);
  if (!match) return undefined;
  try {
    const response = await fetch(`https://${match[1]}.wikipedia.org/api/rest_v1/page/summary/${match[2]}`, {
      headers: { "User-Agent": "PeopleApp/1.0 (hiring workplace lookup)" },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return undefined;
    const page = (await response.json()) as { type?: string; title?: string; description?: string; extract?: string; thumbnail?: { source?: string }; originalimage?: { source?: string }; content_urls?: { desktop?: { page?: string } } };
    if (page.type !== "standard" || !page.extract || !page.title) return undefined;
    return { title: page.title, description: page.description, extract: page.extract, image: page.originalimage?.source ?? page.thumbnail?.source, url: page.content_urls?.desktop?.page ?? url };
  } catch {
    return undefined;
  }
}

/** Shared body of the workplace search actions, after each has checked access. */
export async function runWorkplaceSearch(query: string): Promise<WorkplaceSearchResult> {
  const q = query.trim().slice(0, 200);
  if (!q) return { ok: true, results: [] };
  let results: WebResult[];
  try {
    results = await searchWeb(q);
  } catch {
    return { ok: false, error: "Web results are unavailable right now." };
  }
  const wiki = results.slice(0, 5).find((r) => /wikipedia\.org\/wiki\//.test(r.url));
  const [about, pages] = await Promise.all([
    wiki ? wikipediaAbout(wiki.url) : undefined,
    Promise.all(results.map((r): Promise<{ image?: string; embedUrl?: string }> => (r.url.startsWith("https:") ? pageInfo(r.url) : Promise.resolve({})))),
  ]);
  return {
    ok: true,
    about,
    results: results.map((r, i) => ({ ...r, image: r === wiki ? undefined : pages[i].image, embedUrl: pages[i].embedUrl })),
  };
}
