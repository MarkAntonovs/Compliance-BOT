import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { Run } from "@/lib/types";

export const runtime = "nodejs";
const DIR = path.join(process.cwd(), "data", "runs");

// GET: list of saved test runs (short info). POST: save a new run.
export async function GET() {
  const files = (await fs.readdir(DIR).catch(() => [])).filter(f => f.endsWith(".json")).sort().reverse();
  const runs = [];
  for (const f of files) {
    try {
      const r = JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")) as Run;
      runs.push({ id: r.id, name: r.name, createdAt: r.createdAt, cases: r.caseIds.length, models: r.models.map(m => m.label),
        cost: r.cells.reduce((a, c) => a + (c.costUsd || 0), 0) });
    } catch { /* skip */ }
  }
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const run = (await req.json()) as Run;
  if (!/^[\w-]+$/.test(run.id)) return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, run.id + ".json"), JSON.stringify(run, null, 1), "utf8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Не удалось сохранить прогон. На сервере (Vercel) файлы не сохраняются — запускайте лабораторию локально." }, { status: 500 });
  }
}
