import { NextResponse } from "next/server";
import { activeModel } from "@/lib/agents";

export const runtime = "nodejs";

// Which model each agent uses right now, with the approximate price used for cost estimates.
export async function GET() {
  const out: Record<string, unknown> = {};
  for (const role of ["generator", "analyst", "drafter"] as const) {
    try { const { m } = await activeModel(role); out[role] = { model: m.model, priceIn: m.priceIn, priceOut: m.priceOut }; }
    catch (e) { out[role] = { error: e instanceof Error ? e.message : String(e) }; }
  }
  return NextResponse.json(out);
}
