import { NextResponse } from "next/server";
import { DEMO_PROVIDER, maskKey, onServer, PROVIDERS, readSettings, writeKeys, writeModels } from "@/lib/settings";
import type { ModelEntry, ProviderId } from "@/lib/types";

export const runtime = "nodejs";

// GET never returns the full keys — only a masked preview.
export async function GET() {
  const s = await readSettings();
  const keys: Record<string, { set: boolean; preview: string; source?: string }> = Object.fromEntries(
    PROVIDERS.map(p => [p.id, { set: !!s.keys[p.id], preview: maskKey(s.keys[p.id]), source: s.keySource[p.id] }]));
  keys.demo = { set: true, preview: "не нужен" };
  return NextResponse.json({ providers: PROVIDERS, demo: DEMO_PROVIDER, keys, models: s.models, onServer: onServer() });
}

// Body: { keys?: {provider: "new key" | ""}, models?: ModelEntry[] }
// A key sent as "" deletes it; a key not sent stays as it is.
export async function POST(req: Request) {
  const body = await req.json();
  try {
    if (body.keys && typeof body.keys === "object") {
      const s = await readSettings();
      const keys = { ...s.keys };
      for (const p of PROVIDERS) if (s.keySource[p.id] === "env") delete keys[p.id]; // never copy env keys into the file
      for (const [p, v] of Object.entries(body.keys as Record<string, string>)) {
        if (!PROVIDERS.some(x => x.id === p)) continue;
        if (v === "") delete keys[p as ProviderId]; else if (typeof v === "string") keys[p as ProviderId] = v.trim();
      }
      await writeKeys(keys);
    }
    if (Array.isArray(body.models)) {
      await writeModels((body.models as ModelEntry[]).map(m => ({
        id: String(m.id), provider: m.provider, model: String(m.model || "").trim(), label: String(m.label || "").trim(),
        priceIn: Number(m.priceIn) || 0, priceOut: Number(m.priceOut) || 0, enabled: m.enabled !== false,
      })));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
