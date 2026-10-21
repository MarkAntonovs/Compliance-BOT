import { NextResponse } from "next/server";
import { listStatus } from "@/lib/sanctions";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json({ ok: true, lists: await listStatus() }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
