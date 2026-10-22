import { NextResponse } from "next/server";
import { findCompanies, companyProfile, why } from "@/lib/lvregister";

export const runtime = "nodejs";
export const maxDuration = 60;

// Diagnostics: /api/partner/diag?q=40203246661 — shows exactly what the Latvian register returns.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "40003074764";
  const out: Record<string, unknown> = { q };
  try { out.ping = (await fetch("https://data.gov.lv/dati/api/3/action/status_show", { signal: AbortSignal.timeout(20_000) })).status; } catch (e) { out.ping = why(e); }
  try { out.companies = await findCompanies(q); } catch (e) { out.companies_error = why(e); }
  if (/^\d{11}$/.test(q)) { try { out.profile = await companyProfile(q); } catch (e) { out.profile_error = why(e); } }
  return NextResponse.json(out);
}
