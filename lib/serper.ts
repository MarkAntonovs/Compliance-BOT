// Google results through Serper.dev (≈ $1 per 1000 searches; 2500 free on sign-up). Key: SERPER_API_KEY.
// We choose the queries ourselves and pass only short snippets to the model — much cheaper than letting the model browse.

export type Snippet = { q: string; title: string; url: string; snippet: string; date?: string };

export const hasSerper = () => !!process.env.SERPER_API_KEY;

async function one(q: string, num = 8): Promise<Snippet[]> {
  const res = await fetch(process.env.SERPER_URL || "https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY || "", "content-type": "application/json" },
    body: JSON.stringify({ q, num }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Поиск Google (Serper) ответил ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const out: Snippet[] = [];
  if (j.knowledgeGraph?.title) out.push({ q, title: j.knowledgeGraph.title, url: j.knowledgeGraph.website || "", snippet: [j.knowledgeGraph.type, j.knowledgeGraph.description].filter(Boolean).join(" — ") });
  for (const r of j.organic || []) out.push({ q, title: String(r.title || ""), url: String(r.link || ""), snippet: String(r.snippet || ""), date: r.date ? String(r.date) : undefined });
  return out;
}

// Several queries in parallel; duplicate pages are dropped.
export async function google(queries: string[]): Promise<{ results: Snippet[]; searches: number; errors: string[] }> {
  const errors: string[] = [];
  const lists = await Promise.all(queries.map(q => one(q).catch(e => { errors.push(e instanceof Error ? e.message : String(e)); return [] as Snippet[]; })));
  const seen = new Set<string>(), results: Snippet[] = [];
  for (const l of lists) for (const r of l) { const k = r.url || r.title; if (!seen.has(k)) { seen.add(k); results.push(r); } }
  return { results, searches: queries.length, errors };
}

export const SERPER_PRICE = 0.001; // USD per search
