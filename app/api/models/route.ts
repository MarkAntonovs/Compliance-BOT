import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { listModels } from "@/lib/providers";
import type { ProviderId } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/models?provider=openai — asks the provider which models this key can use.
// Also works as a connection check for the key.
export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get("provider") as ProviderId | null;
  if (!provider) return NextResponse.json({ ok: false, error: "provider?" }, { status: 400 });
  const s = await readSettings();
  try {
    const models = await listModels(provider, s.keys[provider] || "");
    return NextResponse.json({ ok: true, models });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
