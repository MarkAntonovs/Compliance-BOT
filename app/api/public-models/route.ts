import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";

export const runtime = "nodejs";

// Models the public page may use: enabled, with a key (or demo). Only id + name, nothing secret.
export async function GET() {
  const s = await readSettings();
  const models = s.models
    .filter(m => m.enabled && m.model && (m.provider === "demo" || !!s.keys[m.provider]))
    .map(m => ({ id: m.id, label: m.label || m.model, provider: m.provider }));
  return NextResponse.json({ models });
}
