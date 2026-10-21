import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkPartner, type PartnerInput } from "@/lib/partner";

export const runtime = "nodejs";
export const maxDuration = 300;

// Full partner check: registry → screening → AI report. Saved to partner_checks.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const input: PartnerInput = {
    country: b.country === "LV" ? "LV" : "other",
    regcode: /^\d{11}$/.test(String(b.regcode || "").trim()) ? String(b.regcode).trim() : undefined,
    name: String(b.name || "").trim().slice(0, 300),
    notes: String(b.notes || "").slice(0, 20000),
    extraNames: String(b.extraNames || "").slice(0, 4000),
    lang: ["ru", "en", "lv"].includes(b.lang) ? b.lang : "ru",
  };
  if (!input.name && !input.regcode) return NextResponse.json({ ok: false, error: "Укажите партнёра" }, { status: 400 });
  try {
    const r = await checkPartner(input);
    const p = await db();
    const title = r.registry?.company.name || input.name || input.regcode!;
    const ins = await p.query(
      `insert into partner_checks (title, input, registry, parties, hits, report, model, raw, error, cost_usd)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, created_at`,
      // jsonb: pass JSON text — node-pg would turn JS arrays into Postgres arrays
      [title, JSON.stringify({ ...input, warnings: r.warnings, lists: r.lists }), JSON.stringify(r.registry), JSON.stringify(r.parties), JSON.stringify(r.screened), JSON.stringify(r.report), r.model, r.raw, r.error, r.costUsd]);
    return NextResponse.json({ ok: !r.error, id: ins.rows[0].id, created_at: ins.rows[0].created_at, title, ...r, raw: undefined });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
