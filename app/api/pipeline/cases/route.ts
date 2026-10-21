import { NextResponse } from "next/server";
import { db, hasDb } from "@/lib/db";

export const runtime = "nodejs";

// List of cases with their latest analysis and its latest review (for the review queue).
export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "База данных не подключена (нет DATABASE_URL).", cases: [] });
  try {
    const p = await db();
    const { rows } = await p.query(`
      select c.id, c.topic, c.title, c.created_at,
             a.id as analysis_id, a.error as analysis_error, a.created_at as analysed_at, a.rule_ids,
             (select count(*)::int from analyses x where x.case_id = c.id) as runs,
             r.verdict, r.created_at as reviewed_at
      from cases c
      left join lateral (select * from analyses a where a.case_id = c.id order by a.created_at desc limit 1) a on true
      left join lateral (select * from reviews r where r.analysis_id = a.id order by r.created_at desc limit 1) r on true
      order by c.created_at desc limit 500`);
    const cost = await p.query("select coalesce(sum(cost_usd),0)::float as usd from analyses");
    return NextResponse.json({ ok: true, cases: rows, totalCostUsd: cost.rows[0].usd });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), cases: [] }, { status: 500 });
  }
}
