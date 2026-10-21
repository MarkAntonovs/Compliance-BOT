import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyse, ANALYST_VERSION, type CaseData } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 300;

// Analyst (the product) on a stored case, with the currently active rules. Saves the result.
export async function POST(req: Request) {
  const { caseId } = await req.json();
  try {
    const p = await db();
    const { rows } = await p.query("select * from cases where id = $1", [caseId]);
    if (!rows[0]) return NextResponse.json({ ok: false, error: "Кейс не найден" }, { status: 404 });
    const c = rows[0].data as CaseData;
    let out, err: string | null = null;
    try { out = await analyse(c, "ru"); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    const ins = await p.query(
      "insert into analyses (case_id, model, prompt_version, rule_ids, output, raw, error, cost_usd, latency_ms) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",
      [caseId, out?.model || "-", ANALYST_VERSION, out?.ruleIds || [], out?.data || null, out?.raw || null,
       err || (out && !out.data ? "Модель ответила не в формате JSON" : null), out?.costUsd || 0, out?.latencyMs || 0]);
    return NextResponse.json({ ok: !err && !!out?.data, analysis: ins.rows[0] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
