import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
const DIR = path.join(process.cwd(), "data", "runs");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[\w-]+$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    return NextResponse.json(JSON.parse(await fs.readFile(path.join(DIR, id + ".json"), "utf8")));
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
