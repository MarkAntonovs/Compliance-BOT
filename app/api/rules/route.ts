import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const p = await db();
    const { rows } = await p.query("select * from rules order by case status when 'draft' then 0 when 'active' then 1 else 2 end, id");
    return NextResponse.json({ ok: true, rules: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), rules: [] }, { status: 500 });
  }
}

// Manual rule (status draft unless given).
export async function POST(req: Request) {
  const { title, body, status = "draft" } = await req.json();
  if (!title?.trim() || !body?.trim()) return NextResponse.json({ ok: false, error: "Нужны название и текст" }, { status: 400 });
  const p = await db();
  const r = await p.query("insert into rules (title, body, status) values ($1,$2,$3) returning *", [title.trim(), body.trim(), status]);
  return NextResponse.json({ ok: true, rule: r.rows[0] });
}
