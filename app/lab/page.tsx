"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ResultView from "@/components/ResultView";
import type { AnalyzeResult, Lang, ModelEntry, Run, RunCell, TestCase } from "@/lib/types";

type RunInfo = { id: string; name: string; createdAt: string; cases: number; models: string[]; cost: number };

const fmt$ = (n: number) => "$" + (n < 0.01 && n > 0 ? n.toFixed(5) : n.toFixed(4));
const fmtS = (ms: number) => (ms / 1000).toFixed(1) + " s";

// Automatic checks that need no human: did the model return valid JSON, and did it raise the flag on trap cases?
function safetyCheck(c: TestCase | undefined, cell: RunCell): boolean | null {
  if (!c || !(c.expect_safety || c.expect_scam_warning)) return null;
  return !!cell.data?.safety_note;
}

export default function LabPage() {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selCases, setSelCases] = useState<Set<string>>(new Set());
  const [selModels, setSelModels] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "forum" | "syn">("all");
  const [uiLang, setUiLang] = useState<Lang>("ru");
  const [parallel, setParallel] = useState(3);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [history, setHistory] = useState<RunInfo[]>([]);
  const [open, setOpen] = useState<RunCell | null>(null);
  const stopRef = useRef(false);

  const loadHistory = () => fetch("/api/runs").then(r => r.json()).then(d => setHistory(d.runs));
  useEffect(() => {
    fetch("/api/cases").then(r => r.json()).then(d => setCases(d.cases));
    fetch("/api/settings").then(r => r.json()).then(s => {
      const ms = (s.models as ModelEntry[]).filter(m => m.enabled && m.model && s.keys[m.provider]?.set);
      setModels(ms); setSelModels(new Set(ms.map(m => m.id)));
    });
    loadHistory();
  }, []);

  const shown = cases.filter(c => filter === "all" || c.src === filter);
  const caseById = useMemo(() => Object.fromEntries(cases.map(c => [c.id, c])), [cases]);

  function toggle(set: Set<string>, id: string, upd: (s: Set<string>) => void) {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); upd(n);
  }

  async function saveRun(r: Run) {
    await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
  }

  async function start() {
    const cIds = cases.filter(c => selCases.has(c.id)).map(c => c.id);
    const ms = models.filter(m => selModels.has(m.id));
    if (!cIds.length || !ms.length) return;
    const now = new Date();
    const r: Run = {
      id: now.toISOString().replace(/[:.]/g, "-"), createdAt: now.toISOString(),
      name: `${cIds.length} кейсов × ${ms.length} моделей`, caseIds: cIds,
      models: ms.map(m => ({ id: m.id, label: m.label || m.model, provider: m.provider, model: m.model })), cells: [],
    };
    const jobs = cIds.flatMap(cid => ms.map(m => ({ cid, m })));
    setRun(r); setRunning(true); setDone(0); setTotal(jobs.length); stopRef.current = false;

    let next = 0; const cells: RunCell[] = [];
    async function worker() {
      while (!stopRef.current && next < jobs.length) {
        const { cid, m } = jobs[next++];
        const c = caseById[cid];
        let res: AnalyzeResult;
        try {
          res = await (await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ modelId: m.id, request: c.bank_request_text, context: c.user_context || "", clientType: c.client_type, replyLang: "same", uiLang }) })).json();
        } catch (e) {
          res = { ok: false, error: String(e), modelId: m.id, label: m.label || m.model, provider: m.provider, model: m.model, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 };
        }
        cells.push({ ...res, caseId: cid });
        setRun(prev => prev ? { ...prev, cells: [...cells] } : prev);
        setDone(d => d + 1);
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, 8)) }, worker));
    const final = { ...r, cells: [...cells] };
    setRun(final); setRunning(false);
    await saveRun(final); loadHistory();
  }

  async function loadRun(id: string) {
    const r = await (await fetch("/api/runs/" + id)).json();
    setRun(r); setDone(r.cells.length); setTotal(r.cells.length);
  }

  async function scoreCell(cell: RunCell, score: number | null, note?: string) {
    if (!run) return;
    const cells = run.cells.map(c => c.caseId === cell.caseId && c.modelId === cell.modelId ? { ...c, score, note: note ?? c.note } : c);
    const r = { ...run, cells }; setRun(r);
    setOpen(o => o ? { ...o, score, note: note ?? o.note } : o);
    await saveRun(r);
  }

  const summary = useMemo(() => {
    if (!run) return [];
    return run.models.map(m => {
      const cs = run.cells.filter(c => c.modelId === m.id);
      const ok = cs.filter(c => c.ok);
      const saf = cs.map(c => safetyCheck(caseById[c.caseId], c)).filter(x => x !== null) as boolean[];
      const scored = cs.filter(c => typeof c.score === "number");
      const cost = cs.reduce((a, c) => a + (c.costUsd || 0), 0);
      return {
        m, n: cs.length, ok: ok.length,
        lat: ok.length ? ok.reduce((a, c) => a + c.latencyMs, 0) / ok.length : 0,
        tin: cs.reduce((a, c) => a + c.tokensIn, 0), tout: cs.reduce((a, c) => a + c.tokensOut, 0),
        cost, per: cs.length ? cost / cs.length : 0,
        items: ok.length ? ok.reduce((a, c) => a + (c.data?.requested_items?.length || 0), 0) / ok.length : 0,
        safPass: saf.filter(Boolean).length, safN: saf.length,
        score: scored.length ? scored.reduce((a, c) => a + (c.score as number), 0) / scored.length : null, scoredN: scored.length,
      };
    });
  }, [run, caseById]);

  const calls = selCases.size * selModels.size;

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Тест-лаборатория</h1>
          <p className="sub">Прогоняет одни и те же кейсы через выбранные модели и сравнивает: формат ответа, скорость, токены, стоимость и ваши оценки. Каждый прогон сохраняется в <code>data/runs/</code>.</p>
        </div>
      </div>

      {models.length === 0 ? <div className="warnbox" style={{ marginBottom: 16 }}>Нет ни одной настроенной модели. <Link href="/settings">Добавьте API-ключ и модели в Настройках.</Link></div> : null}

      <div className="grid2">
        <div className="panel">
          <h2>Кейсы <span className="count">{selCases.size} из {cases.length}</span></h2>
          <div className="actions" style={{ marginBottom: 10 }}>
            <div className="seg" role="group" aria-label="Фильтр">
              {([["all", "Все"], ["forum", "С форумов"], ["syn", "Сгенерированные"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <button type="button" className="btn ghost small" onClick={() => setSelCases(new Set([...selCases, ...shown.map(c => c.id)]))}>Выбрать показанные</button>
            <button type="button" className="btn ghost small" onClick={() => setSelCases(new Set())}>Снять всё</button>
          </div>
          <div className="caselist">
            <ul className="list">
              {shown.map(c => (
                <li key={c.id}>
                  <label className="checkrow">
                    <input type="checkbox" checked={selCases.has(c.id)} onChange={() => toggle(selCases, c.id, setSelCases)} />
                    <span><span className="mono note">{c.id}</span> {c.title} {c.expect_safety || c.expect_scam_warning ? <span className="pill warn">ловушка</span> : null}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <p className="note">Кейсы лежат в <code>data/cases/*.json</code>. Новый файл в этой папке сразу появится здесь.</p>
        </div>

        <div className="panel">
          <h2>Модели</h2>
          <ul className="list" style={{ marginBottom: 14 }}>
            {models.map(m => (
              <li key={m.id}>
                <label className="checkrow">
                  <input type="checkbox" checked={selModels.has(m.id)} onChange={() => toggle(selModels, m.id, setSelModels)} />
                  <span>{m.label || m.model} <span className="note mono">{m.provider} · {m.model}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <div className="field">
              <label htmlFor="ul">Язык объяснений</label>
              <select id="ul" value={uiLang} onChange={e => setUiLang(e.target.value as Lang)}>
                <option value="ru">Русский</option><option value="en">English</option><option value="lv">Latviešu</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="par">Запросов одновременно</label>
              <input id="par" type="number" min={1} max={8} value={parallel} onChange={e => setParallel(Number(e.target.value) || 1)} />
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="button" disabled={running || !calls} onClick={start}>Запустить тест ({calls} вызовов)</button>
            {running ? <button className="btn danger" type="button" onClick={() => { stopRef.current = true; }}>Остановить</button> : null}
          </div>
          {total ? (
            <div style={{ marginTop: 12 }}>
              <div className="progress"><i style={{ width: (100 * done / total) + "%" }} /></div>
              <div className="note mono" style={{ marginTop: 4 }}>{done} / {total}{running ? " · идёт прогон…" : ""}</div>
            </div>
          ) : null}
          {history.length ? (
            <>
              <h3 style={{ marginTop: 18 }}>Прошлые прогоны</h3>
              <ul className="list">
                {history.slice(0, 8).map(h => (
                  <li key={h.id} className="actions" style={{ justifyContent: "space-between" }}>
                    <span className="note">{new Date(h.createdAt).toLocaleString("ru-RU")} · {h.name} · {fmt$(h.cost)}</span>
                    <button type="button" className="btn ghost small" onClick={() => loadRun(h.id)}>Открыть</button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      {run && run.cells.length ? (
        <>
          <div className="panel" style={{ marginTop: 20 }}>
            <h2>Итог по моделям</h2>
            <div className="tablewrap">
              <table>
                <thead><tr>
                  <th>Модель</th><th className="num">Готово</th><th className="num">Валидный JSON</th><th className="num">Пунктов в среднем</th>
                  <th className="num">Ловушки пойманы</th><th className="num">Время, ср.</th><th className="num">Токены вход / выход</th>
                  <th className="num">Стоимость</th><th className="num">За кейс</th><th className="num">Ваша оценка</th>
                </tr></thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.m.id}>
                      <td><strong>{s.m.label}</strong><div className="note mono">{s.m.model}</div></td>
                      <td className="num">{s.n}</td>
                      <td className="num">{s.n ? Math.round(100 * s.ok / s.n) : 0}%</td>
                      <td className="num">{s.items.toFixed(1)}</td>
                      <td className="num">{s.safN ? `${s.safPass} / ${s.safN}` : "—"}</td>
                      <td className="num">{fmtS(s.lat)}</td>
                      <td className="num">{s.tin.toLocaleString("ru-RU")} / {s.tout.toLocaleString("ru-RU")}</td>
                      <td className="num">{fmt$(s.cost)}</td>
                      <td className="num">{fmt$(s.per)}</td>
                      <td className="num">{s.score != null ? `${s.score.toFixed(1)} (${s.scoredN})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">Стоимость считается по ценам из Настроек (для OpenRouter — по фактической цене от провайдера). «Ловушки» — кейсы, где модель обязана предупредить: обман, обход санкций, фишинг.</p>
          </div>

          <div className="panel">
            <h2>Все ответы</h2>
            <p className="note" style={{ marginTop: -6 }}>Нажмите на ячейку, чтобы открыть разбор и поставить оценку.</p>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Кейс</th>{run.models.map(m => <th key={m.id}>{m.label}</th>)}</tr></thead>
                <tbody>
                  {run.caseIds.map(cid => (
                    <tr key={cid}>
                      <td style={{ minWidth: 200 }}><span className="mono note">{cid}</span> {caseById[cid]?.title}</td>
                      {run.models.map(m => {
                        const cell = run.cells.find(c => c.caseId === cid && c.modelId === m.id);
                        if (!cell) return <td key={m.id} className="note">{running ? "…" : "—"}</td>;
                        const saf = safetyCheck(caseById[cid], cell);
                        return (
                          <td key={m.id} style={{ minWidth: 150 }}>
                            <button type="button" className="cellbtn" onClick={() => setOpen(cell)}>
                              <span>{cell.ok ? <span className="pill ok">OK</span> : <span className="pill bad">ошибка</span>}{" "}
                                {saf === true ? <span className="pill ok">флаг ✓</span> : saf === false ? <span className="pill bad">флаг ✗</span> : null}
                                {typeof cell.score === "number" ? <span className="pill"> {cell.score}/5</span> : null}</span>
                              <span className="note mono">{cell.ok ? `${cell.data?.requested_items?.length ?? 0} пунктов · ` : ""}{fmtS(cell.latencyMs)} · {fmt$(cell.costUsd)}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {open ? (
        <>
          <div className="drawer-bg" onClick={() => setOpen(null)} />
          <aside className="drawer" role="dialog" aria-label="Разбор">
            <button type="button" className="btn ghost small close" onClick={() => setOpen(null)}>Закрыть</button>
            <h2>{open.caseId} · {open.label}</h2>
            <p className="note">{caseById[open.caseId]?.title}</p>
            {caseById[open.caseId]?.trap ? <div className="warnbox" style={{ marginBottom: 12 }}>Что проверяет кейс: {String(caseById[open.caseId]?.trap)}</div> : null}
            <details style={{ marginBottom: 14 }}>
              <summary className="note">Текст запроса банка</summary>
              <pre className="raw">{caseById[open.caseId]?.bank_request_text}</pre>
              {caseById[open.caseId]?.user_context ? <p className="note">Контекст: {caseById[open.caseId]?.user_context}</p> : null}
            </details>
            <div className="lbl" style={{ marginBottom: 6 }}>Ваша оценка разбора</div>
            <div className="scale" style={{ marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-pressed={open.score === n} onClick={() => scoreCell(open, n)}>{n}</button>)}
              <button type="button" aria-pressed={false} onClick={() => scoreCell(open, null)}>сброс</button>
            </div>
            <textarea aria-label="Комментарий" placeholder="Что модель сделала не так / что пропустила" defaultValue={open.note || ""} key={open.caseId + open.modelId}
              onBlur={e => { if (e.target.value !== (open.note || "")) scoreCell(open, open.score ?? null, e.target.value); }} style={{ minHeight: 70, marginBottom: 16 }} />
            {open.ok && open.data ? <ResultView data={open.data} lang={uiLang} /> : <div className="alert">{open.error}</div>}
            {open.raw ? (<details style={{ marginTop: 16 }}><summary className="note">Сырой ответ модели</summary><pre className="raw">{open.raw}</pre></details>) : null}
          </aside>
        </>
      ) : null}
    </main>
  );
}
