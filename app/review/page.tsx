"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AnalysisView from "@/components/AnalysisView";
import { TOPICS } from "@/lib/topics";
import type { AnalysisV2, CaseData } from "@/lib/agents";

// Andrej's desk: read the case, read the bot's analysis, say "correct" or "has errors",
// and turn important corrections into rules. "Прогнать заново" re-runs the bot with the current rules.

type Row = { id: string; topic: string; title: string; created_at: string; analysis_id: number | null; analysis_error: string | null; runs: number; verdict: "ok" | "bad" | null };
type Analysis = { id: number; model: string; prompt_version: string; rule_ids: number[]; output: AnalysisV2 | null; raw: string | null; error: string | null; cost_usd: string; latency_ms: number; created_at: string };
type Review = { id: number; analysis_id: number; verdict: "ok" | "bad"; what_wrong: string; how_right: string; created_at: string };
type Rule = { id: number; title: string; body: string; status: string };
type Detail = { case: { id: string; topic: string; title: string; data: CaseData; created_at: string }; analyses: Analysis[]; reviews: Review[]; ruleTitles: Record<string, string> };

const topicLabel = (id: string) => TOPICS.find(t => t.id === id)?.label || id;
const when = (s: string) => new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function ReviewDesk() {
  const params = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"todo" | "bad" | "ok" | "all">("todo");
  const [cur, setCur] = useState<string>(params.get("case") || "");
  const [d, setD] = useState<Detail | null>(null);
  const [ver, setVer] = useState(0);
  const [verdict, setVerdict] = useState<"ok" | "bad" | null>(null);
  const [wrong, setWrong] = useState("");
  const [right, setRight] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<Rule | null>(null);
  const [msg, setMsg] = useState("");

  const loadList = () => fetch("/api/pipeline/cases").then(r => r.json()).then(x => { setRows(x.cases || []); setErr(x.ok ? "" : x.error); });
  const loadCase = (id: string) => fetch("/api/pipeline/cases/" + id).then(r => r.json()).then(x => { if (x.ok) { setD(x); setVer(0); } });
  useEffect(() => { loadList(); }, []);
  useEffect(() => { if (cur) { loadCase(cur); setVerdict(null); setWrong(""); setRight(""); setDraft(null); setMsg(""); } }, [cur]);
  useEffect(() => { if (!cur && rows.length) setCur((rows.find(r => !r.verdict) || rows[0]).id); }, [rows, cur]);

  const shown = rows.filter(r => filter === "all" || (filter === "todo" ? !r.verdict : r.verdict === filter));
  const counts = useMemo(() => ({ todo: rows.filter(r => !r.verdict).length, bad: rows.filter(r => r.verdict === "bad").length, ok: rows.filter(r => r.verdict === "ok").length, all: rows.length }), [rows]);
  const a = d?.analyses[ver];
  const reviewsOf = (id?: number) => (d?.reviews || []).filter(r => r.analysis_id === id);

  async function save() {
    if (!a || !verdict) return;
    setBusy("save");
    const r = await (await fetch("/api/pipeline/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analysisId: a.id, verdict, what_wrong: wrong, how_right: right }) })).json();
    setBusy("");
    if (!r.ok) { setMsg(r.error || "Не сохранилось"); return; }
    setMsg("Сохранено"); setVerdict(null); setWrong(""); setRight(""); await loadCase(cur); loadList();
    if (verdict === "ok") { const i = shown.findIndex(x => x.id === cur); const n = shown[i + 1]; if (n) setCur(n.id); }
  }
  async function makeRule(reviewId: number) {
    setBusy("rule"); setMsg("");
    const r = await (await fetch("/api/rules/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewId }) })).json();
    setBusy(""); if (r.ok) setDraft(r.rule); else setMsg(r.error || "Не получилось");
  }
  async function saveRule(status: "active" | "draft") {
    if (!draft) return;
    await fetch("/api/rules/" + draft.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: draft.title, body: draft.body, status }) });
    setMsg(status === "active" ? "Правило утверждено и уже работает. Нажмите «Прогнать заново», чтобы проверить." : "Сохранено черновиком на странице «Правила».");
    setDraft(null);
  }
  async function rerun() {
    setBusy("rerun"); setMsg("");
    const r = await (await fetch("/api/pipeline/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: cur }) })).json();
    setBusy(""); if (!r.ok) setMsg(r.analysis?.error || r.error || "Ошибка разбора");
    await loadCase(cur); loadList();
  }

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Проверка</h1>
          <p className="sub">Прочитай кейс и разбор бота. Если всё верно — «Верно». Если нет — напиши, что не так и как правильно. Важные поправки превращай в правила: бот начнёт применять их сразу.</p>
        </div>
      </div>
      {err ? <div className="alert" style={{ marginBottom: 14 }}>{err}</div> : null}

      <div className="grid-cases">
        <nav className="panel" aria-label="Кейсы" style={{ padding: 10 }}>
          <div className="seg" role="group" aria-label="Фильтр" style={{ marginBottom: 8 }}>
            {([["todo", "Ждут"], ["bad", "Ошибки"], ["ok", "Верно"], ["all", "Все"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {counts[k]}</button>
            ))}
          </div>
          {shown.length ? (
            <ul className="list case-nav">
              {shown.map(r => (
                <li key={r.id}>
                  <button type="button" className="cellbtn" onClick={() => setCur(r.id)} style={{ padding: "7px 8px", background: r.id === cur ? "var(--accent-soft)" : undefined }}>
                    <span style={{ fontSize: ".88rem" }}>{r.title}</span>
                    <span className="note">{topicLabel(r.topic).split(":")[0]} · {r.runs} разб.{r.verdict === "ok" ? " · ✓" : r.verdict === "bad" ? " · ошибки" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="note" style={{ padding: 6 }}>Пусто. Создайте кейсы на странице «Конвейер».</p>}
        </nav>

        {d ? (
          <div style={{ minWidth: 0 }}>
            <div className="panel" style={{ margin: 0 }}>
              <h2 style={{ marginBottom: 6 }}>{d.case.title}</h2>
              <div className="chips" style={{ marginBottom: 12 }}>
                <span className="pill">{topicLabel(d.case.topic)}</span>
                <span className="pill">{d.case.data.client_type}</span>
                <span className="pill">{String(d.case.data.lang).toUpperCase()}</span>
              </div>
              <div className="lbl" style={{ marginBottom: 6 }}>Ситуация</div>
              <pre className="raw" style={{ maxHeight: "none" }}>{d.case.data.facts}</pre>
              <div className="lbl" style={{ margin: "12px 0 6px" }}>Вопрос клиента</div>
              <p style={{ margin: 0 }}>{d.case.data.question}</p>
              {d.case.data.hidden_issues?.length ? (
                <details style={{ marginTop: 12 }}>
                  <summary className="note">Что заложил генератор (открывай после того, как прочитаешь разбор)</summary>
                  <ul className="plain">{d.case.data.hidden_issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </details>
              ) : null}
            </div>

            <div className="panel">
              <div className="actions" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>Разбор бота</h2>
                <div className="actions">
                  {d.analyses.length > 1 ? (
                    <select aria-label="Версия разбора" value={ver} onChange={e => setVer(Number(e.target.value))} style={{ width: "auto" }}>
                      {d.analyses.map((x, i) => <option key={x.id} value={i}>{i === 0 ? "Последний" : "Раньше"} · {when(x.created_at)} · правил: {x.rule_ids.length}</option>)}
                    </select>
                  ) : null}
                  <button type="button" className="btn ghost small" disabled={!!busy} onClick={rerun}>{busy === "rerun" ? "Разбираю…" : "Прогнать заново"}</button>
                </div>
              </div>
              {a ? <p className="note">{a.model} · инструкция {a.prompt_version} · правил применено: {a.rule_ids.length} · {(a.latency_ms / 1000).toFixed(0)} с · ${Number(a.cost_usd).toFixed(3)}</p> : null}
              {a?.output ? <AnalysisView data={a.output} lang="ru" /> : a ? <div className="alert">{a.error}{a.raw ? <pre className="raw">{a.raw}</pre> : null}</div> : <p className="note">Разбора ещё нет. Нажмите «Прогнать заново».</p>}
            </div>

            {a ? (
              <div className="panel">
                <h2>Твоя оценка</h2>
                {reviewsOf(a.id).map(r => (
                  <div key={r.id} className={r.verdict === "ok" ? "okbox" : "warnbox"} style={{ marginBottom: 10 }}>
                    <strong>{r.verdict === "ok" ? "Верно" : "Есть ошибки"}</strong> · <span className="note">{when(r.created_at)}</span>
                    {r.what_wrong ? <p style={{ margin: "6px 0 0" }}><b>Не так:</b> {r.what_wrong}</p> : null}
                    {r.how_right ? <p style={{ margin: "4px 0 0" }}><b>Как правильно:</b> {r.how_right}</p> : null}
                    {r.verdict === "bad" ? <div style={{ marginTop: 8 }}><button type="button" className="btn small" disabled={!!busy} onClick={() => makeRule(r.id)}>{busy === "rule" ? "Формулирую…" : "Сделать правилом"}</button></div> : null}
                  </div>
                ))}
                {draft ? (
                  <div className="panel" style={{ background: "var(--bg)", margin: "0 0 12px" }}>
                    <div className="lbl" style={{ marginBottom: 6 }}>Черновик правила — поправь и утверди</div>
                    <input type="text" aria-label="Название правила" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} style={{ marginBottom: 8 }} />
                    <textarea aria-label="Текст правила" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} style={{ minHeight: 120 }} />
                    <div className="actions" style={{ marginTop: 8 }}>
                      <button type="button" className="btn" onClick={() => saveRule("active")}>Утвердить</button>
                      <button type="button" className="btn ghost" onClick={() => saveRule("draft")}>Оставить черновиком</button>
                    </div>
                  </div>
                ) : null}
                <div className="scale" style={{ marginBottom: 10 }}>
                  <button type="button" aria-pressed={verdict === "ok"} onClick={() => setVerdict("ok")}>Верно</button>
                  <button type="button" aria-pressed={verdict === "bad"} onClick={() => setVerdict("bad")}>Есть ошибки</button>
                </div>
                {verdict === "bad" ? (
                  <>
                    <div className="field"><label htmlFor="ww">Что не так</label><textarea id="ww" style={{ minHeight: 90 }} value={wrong} onChange={e => setWrong(e.target.value)} placeholder="Что бот упустил, понял неправильно или сказал не тем тоном" /></div>
                    <div className="field"><label htmlFor="hr">Как правильно</label><textarea id="hr" style={{ minHeight: 90 }} value={right} onChange={e => setRight(e.target.value)} placeholder="Как бы ты объяснил и что посоветовал клиенту" /></div>
                  </>
                ) : null}
                <div className="actions">
                  <button type="button" className="btn" disabled={!verdict || (verdict === "bad" && !wrong.trim()) || !!busy} onClick={save}>{busy === "save" ? "Сохраняю…" : "Сохранить оценку"}</button>
                  <span className="note">{msg}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : <div className="panel" style={{ margin: 0 }}><p className="note">Выберите кейс слева.</p></div>}
      </div>
    </main>
  );
}

export default function ReviewPage() {
  return <Suspense fallback={<main className="wrap"><p className="note">Загрузка…</p></main>}><ReviewDesk /></Suspense>;
}
