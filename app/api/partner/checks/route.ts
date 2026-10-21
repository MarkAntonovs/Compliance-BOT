import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const p = await db();
    const { rows } = await p.query(`select id, title, created_at, cost_usd, error, report->>'risk_level' as risk_level, report->>'recommendation' as recommendation,
      (select count(*) from jsonb_array_elements(coalesce(hits,'[]'::jsonb)) h where jsonb_array_length(h->'hits') > 0)::int as with_hits
      from partner_checks order by id desc limit 30`);
    return NextResponse.json({ ok: true, checks: rows });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
