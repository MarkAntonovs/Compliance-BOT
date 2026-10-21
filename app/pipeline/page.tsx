"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TOPICS } from "@/lib/topics";

// Conveyor: the generator invents cases on a topic, the bot analyses each one right away.
// Results go to "Проверка" for Andrej.

type Step = { n: number; title?: string; caseId?: string; state: "gen" | "analyse" | "done" | "error"; error?: string; cost: number };

export default function PipelinePage() {
  const [topic, setTopic] = useState(TOPICS[0].id);
  const [count, setCount] = useState(5);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<{ cases: number; cost: number; err?: string } | null>(null);
  const stop = useRef(false);

  const loadStats = () => fetch("/api/pipeline/cases").then(r => r.json()).then(d => setStats({ cases: d.cases?.length || 0, cost: d.totalCostUsd || 0, err: d.ok ? undefined : d.error }));
  useEffect(() => { loadStats(); }, []);

  function upd(n: number, patch: Partial<Step>) { setSteps(s => s.map(x => x.n === n ? { ...x, ...patch } : x)); }

  async function one(n: number) {
    try {
      const g = await (await fetch("/api/pipeline/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic }) })).json();
      if (!g.ok) { upd(n, { state: "error", error: g.error }); return; }
      upd(n, { title: g.case.title, caseId: g.case.id, state: "analyse", cost: g.costUsd || 0 });
      const a = await (await fetch("/api/pipeline/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: g.case.id }) })).json();
      const ac = Number(a.analysis?.cost_usd || 0);
      upd(n, a.ok ? { state: "done", cost: (g.costUsd || 0) + ac } : { state: "error", error: a.analysis?.error || a.error, cost: (g.costUsd || 0) + ac });
    } catch (e) { upd(n, { state: "error", error: String(e) }); }
  }

  async function start() {
    const n = Math.max(1, Math.min(30, count));
    const list: Step[] = Array.from({ length: n }, (_, i) => ({ n: i + 1, state: "gen", cost: 0 }));
    setSteps(list); setRunning(true); stop.current = false;
    let next = 0;
    const worker = async () => { while (!stop.current && next < n) await one(list[next++].n); };
    await Promise.all([worker(), worker()]);
    setRunning(false); loadStats();
  }

  const done = steps.filter(s => s.state === "done" || s.state === "error").length;
  const cost = steps.reduce((a, s) => a + s.cost, 0);

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Конвейер</h1>
          <p className="sub">Генератор придумывает реалистичные кейсы по теме (вымышленные люди и компании), бот сразу их разбирает. Готовые разборы появляются в «Проверке».</p>
        </div>
        {stats ? <span className="note">{stats.err ? <span style={{ color: "var(--bad)" }}>{stats.err}</span> : <>Всего кейсов: {stats.cases} · потрачено на разборы: ${stats.cost.toFixed(2)}</>}</span> : null}
      </div>

      <div className="panel">
        <h2>Новая партия</h2>
        <div className="field">
          <span className="lbl">Тема</span>
          <ul className="list">
            {TOPICS.map(t => (
              <li key={t.id}><label className="checkrow"><input type="radio" name="topic" checked={topic === t.id} onChange={() => setTopic(t.id)} /> <span>{t.label}</span></label></li>
            ))}
          </ul>
        </div>
        <div className="row" style={{ maxWidth: 520 }}>
          <div className="field"><label htmlFor="cnt">Сколько кейсов (1–30)</label>
            <input id="cnt" type="number" min={1} max={30} value={count} onChange={e => setCount(Number(e.target.value) || 1)} /></div>
        </div>
        <div className="actions">
          <button className="btn" type="button" disabled={running} onClick={start}>Создать и разобрать</button>
          {running ? <button className="btn danger" type="button" onClick={() => { stop.current = true; }}>Остановить</button> : null}
          <span className="note">Один кейс — около минуты: генерация и разбор.</span>
        </div>
      </div>

      {steps.length ? (
        <div className="panel">
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Партия: {done} / {steps.length}</h2>
            <span className="note mono">${cost.toFixed(3)}</span>
          </div>
          <div className="progress" style={{ margin: "10px 0 14px" }}><i style={{ width: (100 * done / steps.length) + "%" }} /></div>
          <div className="tablewrap">
            <table>
              <thead><tr><th className="num">#</th><th>Кейс</th><th>Статус</th><th></th></tr></thead>
              <tbody>
                {steps.map(s => (
                  <tr key={s.n}>
                    <td className="num">{s.n}</td>
                    <td>{s.title || <span className="note">…</span>}</td>
                    <td>{s.state === "gen" ? <span className="note">придумываю кейс…</span> : s.state === "analyse" ? <span className="note">бот разбирает…</span>
                      : s.state === "done" ? <span className="pill ok">готово</span> : <><span className="pill bad">ошибка</span> <span className="note" style={{ color: "var(--bad)" }}>{s.error}</span></>}</td>
                    <td>{s.caseId && s.state !== "gen" ? <Link href={`/review?case=${s.caseId}`} className="btn ghost small">Проверить</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </main>
  );
}
