import { NextResponse } from "next/server";
import { refreshList, LISTS, type ListId } from "@/lib/sanctions";

export const runtime = "nodejs";
export const maxDuration = 300;

// Download one official list and replace it in the database. Called by the button on the "Партнёр" page.
export async function POST(req: Request) {
  const { list } = await req.json().catch(() => ({}));
  if (!LISTS.some(l => l.id === list)) return NextResponse.json({ ok: false, error: "Неизвестный список" }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...(await refreshList(list as ListId)) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
