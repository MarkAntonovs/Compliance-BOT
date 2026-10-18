import { NextResponse } from "next/server";
import { DEMO_PROVIDER, maskKey, PROVIDERS, readSettings, writeSettings } from "@/lib/settings";
import type { ModelEntry, ProviderId } from "@/lib/types";

export const runtime = "nodejs";

// GET never returns the full keys — only a masked preview.
export async function GET() {
  const s = await readSettings();
  const keys: Record<string, { set: boolean; preview: string }> = Object.fromEntries(PROVIDERS.map(p => [p.id, { set: !!s.keys[p.id], preview: maskKey(s.keys[p.id]) }]));
  keys.demo = { set: true, preview: "не нужен" };
  return NextResponse.json({ providers: PROVIDERS, demo: DEMO_PROVIDER, keys, models: s.models });
}

// Body: { keys?: {provider: "new key" | ""}, models?: ModelEntry[] }
// A key sent as "" deletes it; a key not sent stays as it is.
export async function POST(req: Request) {
  const body = await req.json();
  const s = await readSettings();
  if (body.keys && typeof body.keys === "object") {
    for (const [p, v] of Object.entries(body.keys as Record<string, string>)) {
      if (!PROVIDERS.some(x => x.id === p)) continue;
      if (v === "") delete s.keys[p as ProviderId]; else if (typeof v === "string") s.keys[p as ProviderId] = v.trim();
    }
  }
  if (Array.isArray(body.models)) {
    s.models = (body.models as ModelEntry[]).map(m => ({
      id: String(m.id), provider: m.provider, model: String(m.model || "").trim(), label: String(m.label || "").trim(),
      priceIn: Number(m.priceIn) || 0, priceOut: Number(m.priceOut) || 0, enabled: m.enabled !== false,
    }));
  }
  await writeSettings(s);
  return NextResponse.json({ ok: true });
}
