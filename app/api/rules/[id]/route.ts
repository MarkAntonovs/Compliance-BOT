import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Edit a rule or change its status: draft → active (approve), active → off, etc.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json();
  if (b.status && !["draft", "active", "off"].includes(b.status)) return NextResponse.json({ ok: false, error: "status?" }, { status: 400 });
  const p = await db();
  const r = await p.query(
    "update rules set title = coalesce($2, title), body = coalesce($3, body), status = coalesce($4, status), updated_at = now() where id = $1 returning *",
    [Number(id), b.title ?? null, b.body ?? null, b.status ?? null]);
  return NextResponse.json({ ok: !!r.rows[0], rule: r.rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await db();
  await p.query("delete from rules where id = $1", [Number(id)]);
  return NextResponse.json({ ok: true });
}
