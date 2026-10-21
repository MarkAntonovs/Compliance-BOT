import { NextResponse } from "next/server";
import { db, hasDb } from "@/lib/db";

export const runtime = "nodejs";

// List of cases with their latest analysis and its latest review (for the review queue).
export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "База данных не подключена (нет DATABASE_URL).", cases: [] });
  try {
    const p = await db();
    const { rows } = await p.query(`
      select c.id, c.topic, c.title, c.created_at,
             a.id as analysis_id, a.error as analysis_error, a.created_at as analysed_at, a.rule_ids,
             (select count(*)::int from analyses x where x.case_id = c.id) as runs,
             r.verdict, r.created_at as reviewed_at
      from cases c
      left join lateral (select * from analyses a where a.case_id = c.id order by a.created_at desc limit 1) a on true
      left join lateral (select * from reviews r where r.analysis_id = a.id order by r.created_at desc limit 1) r on true
      order by c.created_at desc limit 500`);
    const cost = await p.query("select coalesce(sum(cost_usd),0)::float as usd from analyses");
    return NextResponse.json({ ok: true, cases: rows, totalCostUsd: cost.rows[0].usd });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), cases: [] }, { status: 500 });
  }
}

// Add a case by hand (Andrej's own or an anonymised real one).
export async function POST(req: Request) {
  const b = await req.json();
  const facts = String(b.facts || "").trim();
  if (facts.length < 20) return NextResponse.json({ ok: false, error: "Опишите ситуацию подробнее" }, { status: 400 });
  const data = {
    title: String(b.title || "").trim() || facts.slice(0, 80),
    client_type: ["individual", "company", "sole_trader"].includes(b.client_type) ? b.client_type : "individual",
    lang: ["ru", "en", "lv"].includes(b.lang) ? b.lang : "ru",
    facts, question: String(b.question || "").trim(),
    hidden_issues: String(b.hidden_issues || "").split("\n").map((x: string) => x.trim()).filter(Boolean),
  };
  try {
    const p = await db();
    const id = "M" + Date.now().toString(36).toUpperCase();
    await p.query("insert into cases (id, topic, title, data, source) values ($1,$2,$3,$4,'expert')", [id, String(b.topic || "free"), data.title, data]);
    return NextResponse.json({ ok: true, case: { id, title: data.title } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
