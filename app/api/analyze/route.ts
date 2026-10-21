import { NextResponse } from "next/server";
import { onServer } from "@/lib/settings";
import { analyse, ANALYST_VERSION } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 300;

// Public analysis for the client page. Nothing is stored.
// Simple limit against someone burning the API balance: N requests per hour per IP (on the server only).
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const limit = Number(process.env.MAX_REQUESTS_PER_HOUR || 30);
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  if (recent.length >= limit) { hits.set(ip, recent); return true; }
  recent.push(now); hits.set(ip, recent); return false;
}

export async function POST(req: Request) {
  if (onServer()) {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (tooMany(ip)) return NextResponse.json({ ok: false, error: "Слишком много запросов. Попробуйте через час." }, { status: 429 });
  }
  const { facts, question = "", clientType = "individual", lang = "ru" } = await req.json();
  if (!String(facts || "").trim()) return NextResponse.json({ ok: false, error: "Опишите ситуацию или вставьте запрос банка." }, { status: 400 });
  try {
    const r = await analyse({ facts: String(facts), question: String(question), client_type: clientType }, ["ru", "en", "lv"].includes(lang) ? lang : "ru");
    return NextResponse.json({ ok: !!r.data, data: r.data, raw: r.data ? undefined : r.raw, model: r.model, costUsd: r.costUsd, latencyMs: r.latencyMs, version: ANALYST_VERSION,
      error: r.data ? undefined : "Модель ответила не в формате JSON." });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
