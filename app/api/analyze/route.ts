import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { buildPrompt, parseAnalysis } from "@/lib/prompt";
import { callModel } from "@/lib/providers";
import type { AnalyzeInput, AnalyzeResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const input = (await req.json()) as AnalyzeInput;
  const s = await readSettings();
  const m = s.models.find(x => x.id === input.modelId);
  if (!m) return NextResponse.json({ ok: false, error: "Модель не найдена в Настройках." }, { status: 400 });
  if (!input.request?.trim()) return NextResponse.json({ ok: false, error: "Пустой запрос банка." }, { status: 400 });

  const base: AnalyzeResult = { ok: false, modelId: m.id, label: m.label || m.model, provider: m.provider, model: m.model, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 };
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
