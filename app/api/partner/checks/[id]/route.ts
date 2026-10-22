import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const p = await db();
    const { rows } = await p.query("select * from partner_checks where id = $1", [Number(id) || 0]);
    if (!rows[0]) return NextResponse.json({ ok: false, error: "Не найдено" }, { status: 404 });
    const c = rows[0];
    return NextResponse.json({ ok: true, id: c.id, title: c.title, created_at: c.created_at, registry: c.registry, parties: c.parties, screened: c.hits,
      report: c.report, flags: c.flags || [], error: c.error, costUsd: Number(c.cost_usd), model: c.model, warnings: c.input?.warnings || [], lists: c.input?.lists || [], input: c.input });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await db();
  await p.query("delete from partner_checks where id = $1", [Number(id) || 0]);
  return NextResponse.json({ ok: true });
}
