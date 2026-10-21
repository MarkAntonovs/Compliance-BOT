import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Andrej's verdict on one analysis: ok / bad + what is wrong + how it should be.
export async function POST(req: Request) {
  const { analysisId, verdict, what_wrong = "", how_right = "" } = await req.json();
  if (!["ok", "bad"].includes(verdict)) return NextResponse.json({ ok: false, error: "verdict?" }, { status: 400 });
  try {
    const p = await db();
    const r = await p.query("insert into reviews (analysis_id, verdict, what_wrong, how_right) values ($1,$2,$3,$4) returning *",
      [analysisId, verdict, String(what_wrong).slice(0, 8000), String(how_right).slice(0, 8000)]);
    return NextResponse.json({ ok: true, review: r.rows[0] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
