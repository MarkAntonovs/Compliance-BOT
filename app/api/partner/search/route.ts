import { NextResponse } from "next/server";
import { findCompanies } from "@/lib/lvregister";

export const runtime = "nodejs";

// Find a Latvian company by name or registration number.
export async function POST(req: Request) {
  const { q } = await req.json().catch(() => ({}));
  if (!q || String(q).trim().length < 2) return NextResponse.json({ ok: false, error: "Введите название или номер" }, { status: 400 });
  try { return NextResponse.json({ ok: true, companies: await findCompanies(String(q)) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
