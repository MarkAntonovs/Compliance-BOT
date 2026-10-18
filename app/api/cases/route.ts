import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { TestCase } from "@/lib/types";

export const runtime = "nodejs";

// Every .json file in data/cases is a list of test cases. Add a file → its cases appear in the Lab.
export async function GET() {
  const dir = path.join(process.cwd(), "data", "cases");
  const files = (await fs.readdir(dir).catch(() => [])).filter(f => f.endsWith(".json")).sort();
  const cases: (TestCase & { file: string })[] = [];
  for (const f of files) {
    try {
      const arr = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
      if (Array.isArray(arr)) for (const c of arr) cases.push({ ...c, file: f });
    } catch { /* skip broken file */ }
  }
  return NextResponse.json({ cases });
}
