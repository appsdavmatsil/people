import { getSupabaseEnv } from "@/lib/supabase/env";

async function getSupabaseStatus() {
  const env = getSupabaseEnv();

  if (!env) {
    return { ok: false, label: "Keys missing" };
  }

  try {
    const response = await fetch(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.key },
      cache: "no-store",
    });

    return response.ok
      ? { ok: true, label: "Connected" }
      : { ok: false, label: `Unreachable (${response.status})` };
  } catch {
    return { ok: false, label: "Unreachable" };
  }
}

export default async function Home() {
  const supabase = await getSupabaseStatus();

  const foundations = [
    { name: "Git", detail: "appsdavmatsil/people", ok: true },
    { name: "Supabase", detail: supabase.label, ok: supabase.ok },
    { name: "Vercel", detail: "davmatsilApps", ok: true },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-20">
      <p className="text-sm font-medium tracking-[0.18em] text-stone-500 uppercase">
        Staff management
      </p>
      <h1 className="mt-3 text-5xl font-semibold tracking-tight text-stone-950">
        People
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-stone-600">
        The app foundation is in place. Staff structure connects from the
        architecture next.
      </p>

      <ul className="mt-12 divide-y divide-stone-200 border-y border-stone-200">
        {foundations.map((item) => (
          <li
            key={item.name}
            className="flex items-baseline justify-between gap-6 py-4"
          >
            <span className="text-base font-medium text-stone-950">
              {item.name}
            </span>
            <span className="font-mono text-sm text-stone-500">{item.detail}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
