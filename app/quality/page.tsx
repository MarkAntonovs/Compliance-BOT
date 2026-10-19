"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ResultView from "@/components/ResultView";
import type { AnalyzeResult, Lang, ModelEntry, RubricItem, Run, RunCell, TestCase } from "@/lib/types";

// Quality check: run test cases through the product's model, then grade each answer
// by the rubric (data/rubric.json). Compare runs to see whether a new prompt version got better.

type RunInfo = { id: string; name: string; createdAt: string; cost: number; local?: boolean };

const fmt$ = (n: number) => "$" + (n > 0 && n < 0.01 ? n.toFixed(5) : n.toFixed(4));
const fmtS = (ms: number) => (ms / 1000).toFixed(1) + " s";
const LS_PREFIX = "brd-run-";

function trapCheck(c: TestCase | undefined, cell: RunCell): boolean | null {
  if (!c || !(c.expect_safety || c.expect_scam_warning)) return null;
  return !!cell.data?.safety_note;
}
function lsGet<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } }
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } }
function localRuns(): Run[] {
  const out: Run[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(LS_PREFIX)) { const r = lsGet<Run>(k); if (r) out.push(r); } } } catch { /* ignore */ }
  return out;
}

export default function QualityPage() {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [modelId, setModelId] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "forum" | "syn" | "trap">("all");
  const [uiLang, setUiLang] = useState<Lang>("ru");
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [history, setHistory] = useState<RunInfo[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"" | "server" | "browser">("");
  const stopRef = useRef(false);

  async function loadHistory() {
    const server: RunInfo[] = await fetch("/api/runs").then(r => r.json()).then(d => d.runs).catch(() => []);
    const local: RunInfo[] = localRuns().map(r => ({ id: r.id, name: r.name, createdAt: r.createdAt, cost: r.cells.reduce((a, c) => a + (c.costUsd || 0), 0), local: true }));
    const ids = new Set(server.map(r => r.id));
    setHistory([...server, ...local.filter(r => !ids.has(r.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  useEffect(() => {
    fetch("/api/cases").then(r => r.json()).then(d => setCases(d.cases));
    fetch("/api/rubric").then(r => r.json()).then(d => setRubric(d.items));
    fetch("/api/settings").then(r => r.json()).then(s => {
      const ms = (s.models as ModelEntry[]).filter(m => m.enabled && m.model && s.keys[m.provider]?.set);
      setModels(ms);
      setModelId((ms.find(m => m.provider !== "demo") || ms[0])?.id || "");
    });
    loadHistory();
  }, []);

  const caseById = useMemo(() => Object.fromEntries(cases.map(c => [c.id, c])), [cases]);
  const shown = cases.filter(c => filter === "all" || (filter === "trap" ? (c.expect_safety || c.expect_scam_warning) : c.src === filter));
  const model = models.find(m => m.id === modelId);
  const open = run?.cells.find(c => c.caseId === openId) || null;

  async function persist(r: Run) {
    const ok = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) }).then(x => x.ok).catch(() => false);
    if (!ok) lsSet(LS_PREFIX + r.id, r);
    setSaveState(ok ? "server" : "browser");
  }

  async function start() {
    const ids = cases.filter(c => sel.has(c.id)).map(c => c.id);
    if (!ids.length || !model) return;
    const now = new Date();
    const r: Run = { id: now.toISOString().replace(/[:.]/g, "-"), createdAt: now.toISOString(),
      name: `${ids.length} кейсов · ${model.label || model.model}`, caseIds: ids,
      models: [{ id: model.id, label: model.label || model.model, provider: model.provider, model: model.model }], cells: [] };
    setRun(r); setRunning(true); setDone(0); setTotal(ids.length); setSaveState(""); stopRef.current = false;
    let next = 0; const cells: RunCell[] = [];
    async function worker() {
      while (!stopRef.current && next < ids.length) {
        const c = caseById[ids[next++]];
        let res: AnalyzeResult;
        try {
          res = await (await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ modelId: model!.id, request: c.bank_request_text, context: c.user_context || "", clientType: c.client_type, replyLang: "same", uiLang }) })).json();
        } catch (e) {
          res = { ok: false, error: String(e), modelId: model!.id, label: model!.label, provider: model!.provider, model: model!.model, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 };
        }
        cells.push({ ...res, caseId: c.id });
        setRun(p => p ? { ...p, cells: [...cells] } : p);
        setDone(d => d + 1);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    const final: Run = { ...r, promptVersion: cells.find(c => c.promptVersion)?.promptVersion, cells: ids.map(id => cells.find(c => c.caseId === id)).filter(Boolean) as RunCell[] };
    setRun(final); setRunning(false);
    await persist(final); loadHistory();
  }

  async function loadRun(h: RunInfo) {
    const r: Run | null = h.local ? lsGet<Run>(LS_PREFIX + h.id) : await fetch("/api/runs/" + h.id).then(x => x.json()).catch(() => null);
    if (r) { setRun(r); setDone(r.cells.length); setTotal(r.cells.length); setSaveState(h.local ? "browser" : "server"); }
  }

  function grade(caseId: string, patch: Partial<RunCell>) {
    if (!run) return;
    const r = { ...run, cells: run.cells.map(c => c.caseId === caseId ? { ...c, ...patch } : c) };
    setRun(r); persist(r);
  }

  function download() {
    if (!run) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 1)], { type: "application/json" }));
    a.download = `run-${run.id}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function upload(file: File) {
    file.text().then(t => { const r = JSON.parse(t) as Run; if (r?.cells) { setRun(r); setDone(r.cells.length); setTotal(r.cells.length); persist(r); loadHistory(); } }).catch(() => alert("Это не файл прогона."));
  }

  const summary = useMemo(() => {
    if (!run || !run.cells.length) return null;
    const cs = run.cells, ok = cs.filter(c => c.ok);
    const traps = cs.map(c => trapCheck(caseById[c.caseId], c)).filter(x => x !== null) as boolean[];
    const scored = cs.filter(c => typeof c.score === "number");
    const cost = cs.reduce((a, c) => a + (c.costUsd || 0), 0);
    const crit = rubric.map(it => {
      const g = cs.map(c => c.checks?.[it.id]).filter(v => typeof v === "boolean") as boolean[];
      return { it, pass: g.filter(Boolean).length, n: g.length };
    });
    return { n: cs.length, ok: ok.length, cost, per: cost / cs.length,
      lat: ok.length ? ok.reduce((a, c) => a + c.latencyMs, 0) / ok.length : 0,
      trapPass: traps.filter(Boolean).length, trapN: traps.length,
      score: scored.length ? scored.reduce((a, c) => a + (c.score as number), 0) / scored.length : null, scoredN: scored.length, crit };
  }, [run, rubric, caseById]);

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Проверка качества</h1>
          <p className="sub">Прогоняем тестовые кейсы через модель продукта, затем Андрей оценивает каждый разбор по критериям. После правки инструкции запускаем снова и сравниваем прогоны.</p>
        </div>
      </div>

      {models.length === 0 ? <div className="warnbox" style={{ marginBottom: 16 }}>Модель не настроена. <Link href="/settings">Добавьте ключ и модель в Настройках.</Link></div> : null}

      <div className="grid2">
        <div className="panel">
          <h2>Кейсы <span className="count">{sel.size} из {cases.length}</span></h2>
          <div className="actions" style={{ marginBottom: 10 }}>
            <div className="seg" role="group" aria-label="Фильтр">
              {([["all", "Все"], ["syn", "Сгенерированные"], ["forum", "С форумов"], ["trap", "Ловушки"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <button type="button" className="btn ghost small" onClick={() => setSel(new Set([...sel, ...shown.map(c => c.id)]))}>Выбрать показанные</button>
            <button type="button" className="btn ghost small" onClick={() => setSel(new Set())}>Снять всё</button>
          </div>
          <div className="caselist">
            <ul className="list">
              {shown.map(c => (
                <li key={c.id}>
                  <label className="checkrow">
                    <input type="checkbox" checked={sel.has(c.id)} onChange={() => { const n = new Set(sel); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setSel(n); }} />
                    <span><span className="mono note">{c.id}</span> {c.title} {c.expect_safety || c.expect_scam_warning ? <span className="pill warn">ловушка</span> : null}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <p className="note">Кейсы — в <code>data/cases/*.json</code>, критерии — в <code>data/rubric.json</code>.</p>
        </div>

        <div className="panel">
          <h2>Запуск</h2>
          <div className="row">
            <div className="field">
              <label htmlFor="model">Модель</label>
              <select id="model" value={modelId} onChange={e => setModelId(e.target.value)}>
                {models.map(m => <option key={m.id} value={m.id}>{m.label || m.model}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ul">Язык объяснений</label>
              <select id="ul" value={uiLang} onChange={e => setUiLang(e.target.value as Lang)}>
                <option value="ru">Русский</option><option value="en">English</option><option value="lv">Latviešu</option>
              </select>
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="button" disabled={running || !sel.size || !model} onClick={start}>Запустить ({sel.size})</button>
            {running ? <button className="btn danger" type="button" onClick={() => { stopRef.current = true; }}>Остановить</button> : null}
          </div>
          {total ? (
            <div style={{ marginTop: 12 }}>
              <div className="progress"><i style={{ width: (100 * done / total) + "%" }} /></div>
              <div className="note mono" style={{ marginTop: 4 }}>{done} / {total}{running ? " · идёт прогон…" : ""}</div>
            </div>
          ) : null}

          <h3 style={{ marginTop: 20 }}>Прогоны</h3>
          {history.length ? (
            <ul className="list">
              {history.slice(0, 10).map(h => (
                <li key={h.id} className="actions" style={{ justifyContent: "space-between" }}>
                  <span className="note">{new Date(h.createdAt).toLocaleString("ru-RU")} · {h.name} · {fmt$(h.cost)}{h.local ? " · в браузере" : ""}</span>
                  <button type="button" className="btn ghost small" onClick={() => loadRun(h)}>Открыть</button>
                </li>
              ))}
            </ul>
          ) : <p className="note">Пока нет.</p>}
          <label className="note" style={{ display: "block", marginTop: 10, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
            Загрузить файл прогона: <input type="file" accept="application/json" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          </label>
        </div>
      </div>

      {run && summary ? (
        <>
          <div className="panel" style={{ marginTop: 20 }}>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>Итог прогона</h2>
              <div className="actions">
                <span className="note">{saveState === "server" ? "Сохранено в data/runs" : saveState === "browser" ? "Сохранено только в этом браузере — скачайте файл, чтобы не потерять" : ""}</span>
                <button type="button" className="btn ghost small" onClick={download}>Скачать прогон</button>
              </div>
            </div>
            <p className="note">{run.models[0]?.label} · инструкция {run.promptVersion || "—"} · {new Date(run.createdAt).toLocaleString("ru-RU")}</p>
            <div className="tablewrap">
              <table>
                <thead><tr>
                  <th className="num">Разборов</th><th className="num">Без ошибок</th><th className="num">Ловушки пойманы</th>
                  <th className="num">Оценка Андрея</th><th className="num">Время, ср.</th><th className="num">Стоимость</th><th className="num">За разбор</th>
                </tr></thead>
                <tbody><tr>
                  <td className="num">{summary.n}</td>
                  <td className="num">{Math.round(100 * summary.ok / summary.n)}%</td>
                  <td className="num">{summary.trapN ? `${summary.trapPass} / ${summary.trapN}` : "—"}</td>
                  <td className="num">{summary.score != null ? `${summary.score.toFixed(1)} / 5 (${summary.scoredN})` : "—"}</td>
                  <td className="num">{fmtS(summary.lat)}</td>
                  <td className="num">{fmt$(summary.cost)}</td>
                  <td className="num">{fmt$(summary.per)}</td>
                </tr></tbody>
              </table>
            </div>
            {rubric.length ? (
              <div className="tablewrap" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>Критерий</th><th className="num">Выполнен</th><th className="num">Оценено</th></tr></thead>
                  <tbody>
                    {summary.crit.map(({ it, pass, n }) => (
                      <tr key={it.id}><td>{it.label}</td><td className="num">{n ? Math.round(100 * pass / n) + "%" : "—"}</td><td className="num">{n}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <h2>Разборы</h2>
            <p className="note" style={{ marginTop: -6 }}>Откройте разбор, поставьте оценку и отметьте критерии.</p>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Кейс</th><th>Статус</th><th className="num">Критерии</th><th className="num">Оценка</th><th className="num">Стоимость</th><th></th></tr></thead>
                <tbody>
                  {run.caseIds.map(cid => {
                    const cell = run.cells.find(c => c.caseId === cid);
                    const trap = cell ? trapCheck(caseById[cid], cell) : null;
                    const g = cell?.checks ? Object.values(cell.checks) : [];
                    return (
                      <tr key={cid}>
                        <td style={{ minWidth: 220 }}><span className="mono note">{cid}</span> {caseById[cid]?.title}</td>
                        <td>{!cell ? <span className="note">{running ? "…" : "—"}</span> : cell.ok ? <span className="pill ok">OK</span> : <span className="pill bad">ошибка</span>}{" "}
                          {trap === true ? <span className="pill ok">ловушка ✓</span> : trap === false ? <span className="pill bad">ловушка ✗</span> : null}</td>
                        <td className="num">{g.length ? `${g.filter(Boolean).length} / ${g.length}` : "—"}</td>
                        <td className="num">{typeof cell?.score === "number" ? `${cell.score} / 5` : "—"}</td>
                        <td className="num">{cell ? fmt$(cell.costUsd) : ""}</td>
                        <td>{cell ? <button type="button" className="btn ghost small" onClick={() => setOpenId(cid)}>Открыть</button> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {open ? (
        <>
          <div className="drawer-bg" onClick={() => setOpenId(null)} />
          <aside className="drawer" role="dialog" aria-label="Разбор">
            <button type="button" className="btn ghost small close" onClick={() => setOpenId(null)}>Закрыть</button>
            <h2>{open.caseId} · {caseById[open.caseId]?.title}</h2>
            {caseById[open.caseId]?.trap ? <div className="warnbox" style={{ marginBottom: 12 }}>Что проверяет кейс: {String(caseById[open.caseId]?.trap)}</div> : null}
            <details style={{ marginBottom: 14 }}>
              <summary className="note">Текст запроса банка</summary>
              <pre className="raw">{caseById[open.caseId]?.bank_request_text}</pre>
              {caseById[open.caseId]?.user_context ? <p className="note">Клиент о себе: {caseById[open.caseId]?.user_context}</p> : null}
            </details>

            <div className="panel" style={{ background: "var(--bg)", marginBottom: 16 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>Критерии</div>
              <ul className="list" style={{ marginBottom: 12 }}>
                {rubric.map(it => {
                  const v = open.checks?.[it.id];
                  const set = (val: boolean | undefined) => { const ch = { ...(open.checks || {}) }; if (val === undefined) delete ch[it.id]; else ch[it.id] = val; grade(open.caseId, { checks: ch }); };
                  return (
                    <li key={it.id} className="actions" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                      <span title={it.hint} style={{ fontSize: ".9rem" }}>{it.label}</span>
                      <span className="scale" style={{ flexWrap: "nowrap" }}>
                        <button type="button" aria-pressed={v === true} onClick={() => set(v === true ? undefined : true)}>да</button>
                        <button type="button" aria-pressed={v === false} onClick={() => set(v === false ? undefined : false)}>нет</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="lbl" style={{ marginBottom: 6 }}>Общая оценка</div>
              <div className="scale" style={{ marginBottom: 10 }}>
                {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-pressed={open.score === n} onClick={() => grade(open.caseId, { score: open.score === n ? null : n })}>{n}</button>)}
              </div>
              <textarea aria-label="Комментарий" placeholder="Что не так, что пропущено, как должно быть" defaultValue={open.note || ""} key={open.caseId}
                onBlur={e => { if (e.target.value !== (open.note || "")) grade(open.caseId, { note: e.target.value }); }} style={{ minHeight: 80 }} />
            </div>

            {open.ok && open.data ? <ResultView data={open.data} lang={uiLang} /> : <div className="alert">{open.error}</div>}
            {open.raw ? (<details style={{ marginTop: 16 }}><summary className="note">Сырой ответ модели</summary><pre className="raw">{open.raw}</pre></details>) : null}
          </aside>
        </>
      ) : null}
    </main>
  );
}
