import { NextResponse } from "next/server";
import { onServer, readSettings } from "@/lib/settings";
import { buildPrompt, parseAnalysis, PROMPT_VERSION } from "@/lib/prompt";
import { callModel } from "@/lib/providers";
import type { AnalyzeInput, AnalyzeResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Simple limit against someone burning the API balance: N requests per hour per IP (on the server only).
// Kept in memory, so it is approximate on Vercel (each instance counts separately).
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
  const input = (await req.json()) as AnalyzeInput;
  const s = await readSettings();
  const m = s.models.find(x => x.id === input.modelId);
  if (!m) return NextResponse.json({ ok: false, error: "Модель не найдена в Настройках." }, { status: 400 });
  if (!input.request?.trim()) return NextResponse.json({ ok: false, error: "Пустой запрос банка." }, { status: 400 });

  const base: AnalyzeResult = { ok: false, modelId: m.id, label: m.label || m.model, provider: m.provider, model: m.model, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0, promptVersion: PROMPT_VERSION };
  const t0 = Date.now();
  try {
    const r = await callModel(m.provider, s.keys[m.provider] || "", m.model, buildPrompt(input));
    const latencyMs = Date.now() - t0;
    const costUsd = r.providerCostUsd ?? (r.tokensIn * (m.priceIn || 0) + r.tokensOut * (m.priceOut || 0)) / 1e6;
    const data = parseAnalysis(r.text);
    const out: AnalyzeResult = { ...base, ok: !!data, data: data || undefined, raw: r.text, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd, latencyMs,
      error: data ? undefined : "Модель ответила не в формате JSON." };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ...base, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
  }
}
