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
  const [models, setModels] = useState<Record<string, { model?: string; priceIn?: number; priceOut?: number; error?: string }>>({});
  const stop = useRef(false);

  const loadStats = () => fetch("/api/pipeline/cases").then(r => r.json()).then(d => setStats({ cases: d.cases?.length || 0, cost: d.totalCostUsd || 0, err: d.ok ? undefined : d.error }));
  useEffect(() => { loadStats(); fetch("/api/pipeline/models").then(r => r.json()).then(setModels).catch(() => {}); }, []);

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

  const [mf, setMf] = useState({ title: "", facts: "", question: "", client_type: "individual", topic: "russia", hidden_issues: "" });
  const [mBusy, setMBusy] = useState(false);
  const [mMsg, setMMsg] = useState<{ id?: string; text: string } | null>(null);
  async function addManual() {
    setMBusy(true); setMMsg(null);
    const r = await (await fetch("/api/pipeline/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mf) })).json();
    if (!r.ok) { setMBusy(false); setMMsg({ text: r.error }); return; }
    setMMsg({ id: r.case.id, text: "Кейс сохранён, бот разбирает…" });
    const a = await (await fetch("/api/pipeline/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: r.case.id }) })).json();
    setMBusy(false); setMMsg({ id: r.case.id, text: a.ok ? "Готово — разбор ждёт в «Проверке»." : "Кейс сохранён, но разбор не удался: " + (a.analysis?.error || a.error) });
    setMf({ ...mf, title: "", facts: "", question: "", hidden_issues: "" }); loadStats();
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

      {models.generator ? (
        <p className="note" style={{ marginTop: -6, marginBottom: 14 }}>
          Модели: генератор — <b>{models.generator.model || models.generator.error}</b> · разбор — <b>{models.analyst?.model || models.analyst?.error}</b>
          {models.analyst?.priceOut ? <> · цена разбора ≈ ${models.analyst.priceIn}/${models.analyst.priceOut} за 1 млн токенов (вход/выход)</> : null}
        </p>
      ) : null}
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

      <details className="panel">
        <summary style={{ cursor: "pointer" }}><strong>Добавить свой кейс</strong> <span className="note">— твоя ситуация или обезличенный реальный случай</span></summary>
        <div style={{ marginTop: 14 }}>
          <div className="field"><label htmlFor="mt">Название</label><input id="mt" type="text" value={mf.title} onChange={e => setMf({ ...mf, title: e.target.value })} placeholder="Коротко, о чём кейс" /></div>
          <div className="field"><label htmlFor="mfacts">Ситуация (от лица клиента: что он знает, какие документы, что пишет банк)</label><textarea id="mfacts" style={{ minHeight: 180 }} value={mf.facts} onChange={e => setMf({ ...mf, facts: e.target.value })} /></div>
          <div className="field"><label htmlFor="mq">Вопрос клиента</label><textarea id="mq" style={{ minHeight: 60 }} value={mf.question} onChange={e => setMf({ ...mf, question: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label htmlFor="mct">Клиент</label><select id="mct" value={mf.client_type} onChange={e => setMf({ ...mf, client_type: e.target.value })}><option value="individual">Частное лицо</option><option value="company">Компания</option><option value="sole_trader">Самозанятый</option></select></div>
            <div className="field"><label htmlFor="mtp">Тема</label><select id="mtp" value={mf.topic} onChange={e => setMf({ ...mf, topic: e.target.value })}>{TOPICS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          </div>
          <div className="field"><label htmlFor="mh">Что должен найти хороший разбор (по строке на пункт, бот этого не видит)</label><textarea id="mh" style={{ minHeight: 80 }} value={mf.hidden_issues} onChange={e => setMf({ ...mf, hidden_issues: e.target.value })} /></div>
          <div className="actions">
            <button className="btn" type="button" disabled={mBusy || mf.facts.trim().length < 20} onClick={addManual}>{mBusy ? "Сохраняю и разбираю…" : "Сохранить и разобрать"}</button>
            {mMsg ? <span className="note">{mMsg.text} {mMsg.id ? <Link href={`/review?case=${mMsg.id}`}>Открыть</Link> : null}</span> : null}
          </div>
        </div>
      </details>

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
