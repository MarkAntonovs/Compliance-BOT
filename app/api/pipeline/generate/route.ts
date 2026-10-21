import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateCase, TOPICS } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 300;

// Generator agent: invent one realistic fictional case on a topic and save it.
export async function POST(req: Request) {
  const { topic } = await req.json();
  if (!TOPICS.some(t => t.id === topic)) return NextResponse.json({ ok: false, error: "Неизвестная тема" }, { status: 400 });
  try {
    const p = await db();
    const { rows } = await p.query("select title from cases order by created_at desc limit 60");
    const r = await generateCase(topic, rows.map(x => x.title), Math.floor(Math.random() * 1000));
    if (!r.data) return NextResponse.json({ ok: false, error: "Генератор ответил не в том формате", raw: r.raw.slice(0, 2000) });
    const id = "G" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    await p.query("insert into cases (id, topic, title, data, source) values ($1,$2,$3,$4,'generated')", [id, topic, r.data.title, r.data]);
    return NextResponse.json({ ok: true, case: { id, topic, title: r.data.title, data: r.data }, costUsd: r.costUsd });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
