import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

// Quality criteria Andrej grades by. Edit data/rubric.json to change them.
export async function GET() {
  try {
    const items = JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "rubric.json"), "utf8"));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
