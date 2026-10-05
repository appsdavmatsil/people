export function nameTokens(name: string): string[] {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  // Join runs of single-letter initials so "K C" matches "KC".
  const tokens: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].length === 1 && i > 0 && words[i - 1].length === 1) {
      tokens[tokens.length - 1] += words[i];
    } else {
      tokens.push(words[i]);
    }
  }
  return tokens;
}

// Same word, a shortened form of it, or a one-letter typo in a long word
// ("ruparathne" / "ruparathna", "silva" / "silvva").
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return Math.min(a.length, b.length) >= 5 && withinOneEdit(a, b);
}

// True when one insertion, deletion or substitution turns a into b.
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Share of the submitted name's words found in the employee's name (0–1).
export function nameScore(submitted: string[], employeeName: string): number {
  if (!submitted.length) return 0;
  const candidate = nameTokens(employeeName);
  const matched = submitted.filter((token) =>
    candidate.some((c) => wordsMatch(c, token)),
  ).length;
  return matched / submitted.length;
}

// True when one name's words are (almost) all found in the other, so
// "Harish Rawat" matches "Harish Singh Rawat". Needs two shared words unless
// a name is a single word.
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const best = Math.max(nameScore(ta, b), nameScore(tb, a));
  const shared = Math.round(nameScore(ta, b) * ta.length);
  return best >= 0.75 && shared >= Math.min(2, ta.length, tb.length);
}
