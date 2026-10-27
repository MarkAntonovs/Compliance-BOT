import { NextResponse } from "next/server";
import { onServer } from "@/lib/settings";
import { draftReply, formatError } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 300;

// Step 2: after the client answered the clarifying questions, write the reply letter to the bank. Nothing is stored.
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
  const b = await req.json().catch(() => ({}));
  const facts = String(b.facts || "");
  if (!facts.trim()) return NextResponse.json({ ok: false, error: "Нет описания ситуации." }, { status: 400 });
  const answers = Array.isArray(b.answers) ? b.answers.slice(0, 10).map((x: { q?: unknown; a?: unknown }) => ({ q: String(x?.q || ""), a: String(x?.a || "").slice(0, 3000) })) : [];
  const lang = ["ru", "en", "lv"].includes(b.lang) ? b.lang : "ru";
  try {
    const r = await draftReply({ facts, question: String(b.question || ""), analysis: b.analysis || null, answers }, lang);
    return NextResponse.json({ ok: !!r.data, data: r.data, costUsd: r.costUsd, model: r.model, error: formatError(r) || undefined });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
