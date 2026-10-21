import { NextResponse } from "next/server";
import { refreshList, LISTS, type ListId } from "@/lib/sanctions";

export const runtime = "nodejs";
export const maxDuration = 300;

// Daily refresh by Vercel Cron (see vercel.json): /api/sanctions/cron?list=eu
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project's environment variables.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  const list = new URL(req.url).searchParams.get("list");
  const ids = (list ? [list] : LISTS.map(l => l.id)).filter(x => LISTS.some(l => l.id === x)) as ListId[];
  const results = [];
  for (const id of ids) {
    try { results.push({ ok: true, ...(await refreshList(id)) }); }
    catch (e) { results.push({ ok: false, id, error: e instanceof Error ? e.message : String(e) }); }
  }
  return NextResponse.json({ ok: results.every(r => r.ok), results });
}
