import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draftRule, type CaseData } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 300;

// Turn one of Andrej's corrections into a draft rule (Claude writes it, Andrej approves it).
export async function POST(req: Request) {
  const { reviewId } = await req.json();
  try {
    const p = await db();
    const q = await p.query(`select r.*, a.output, c.data from reviews r join analyses a on a.id = r.analysis_id join cases c on c.id = a.case_id where r.id = $1`, [reviewId]);
    const row = q.rows[0];
    if (!row) return NextResponse.json({ ok: false, error: "Поправка не найдена" }, { status: 404 });
    const c = row.data as CaseData;
    const r = await draftRule({ facts: c.facts, question: c.question, analysis: row.output, what_wrong: row.what_wrong, how_right: row.how_right });
    if (!r.data?.title || !r.data?.body) return NextResponse.json({ ok: false, error: "Не получилось сформулировать правило", raw: r.raw.slice(0, 1500) });
    const ins = await p.query("insert into rules (title, body, status, review_id) values ($1,$2,'draft',$3) returning *", [r.data.title, r.data.body, reviewId]);
    return NextResponse.json({ ok: true, rule: ins.rows[0] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
