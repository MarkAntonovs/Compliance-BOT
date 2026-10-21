import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// One case with every analysis (newest first) and their reviews.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const p = await db();
    const c = await p.query("select * from cases where id = $1", [id]);
    if (!c.rows[0]) return NextResponse.json({ ok: false, error: "Кейс не найден" }, { status: 404 });
    const a = await p.query("select * from analyses where case_id = $1 order by created_at desc", [id]);
    const ids = a.rows.map(x => x.id);
    const r = ids.length ? await p.query("select * from reviews where analysis_id = any($1) order by created_at desc", [ids]) : { rows: [] };
    const rules = await p.query("select id, title from rules");
    return NextResponse.json({ ok: true, case: c.rows[0], analyses: a.rows, reviews: r.rows, ruleTitles: Object.fromEntries(rules.rows.map(x => [x.id, x.title])) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await db();
  await p.query("delete from cases where id = $1", [id]);
  return NextResponse.json({ ok: true });
}
