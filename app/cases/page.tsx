"use client";
import { useEffect, useMemo, useState } from "react";
import type { TestCase } from "@/lib/types";

// Case library: read every test case in full, and write Andrej's own analysis
// (4 questions) before looking at the model's answer. Notes stay in this browser;
// "Скачать мои разборы" gives a file to send to Claude.

const CAT: Record<string, string> = { source_of_funds: "источник средств", source_of_wealth: "источник благосостояния", transaction_purpose: "цель операции", ubo_structure: "UBO / структура", business_activity: "деятельность", expected_turnover: "обороты", tax_residency: "налоговое резидентство", identity_address: "личность / адрес", sanctions: "санкции", crypto: "крипта", account_freeze: "блокировка счёта", other: "другое" };
const CT: Record<string, string> = { individual: "частное лицо", company: "компания", sole_trader: "самозанятый" };
const QUESTIONS = [
  { id: "wants", label: "Что на самом деле хочет банк и почему?" },
  { id: "evidence", label: "Какие документы или пояснения закрывают каждый пункт? Где их взять?" },
  { id: "never", label: "Что клиенту ни в коем случае нельзя писать или делать?" },
  { id: "bad", label: "Какой ответ ты как комплаенс-офицер посчитал бы плохим?" },
];
const LS_KEY = "brd-expert-notes";
type Notes = Record<string, Record<string, string>>;

function loadNotes(): Notes { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function saveNotes(n: Notes) { try { localStorage.setItem(LS_KEY, JSON.stringify(n)); } catch { /* blocked */ } }

function CaseBody({ c }: { c: TestCase }) {
  return (
    <>
      <div className="chips" style={{ marginBottom: 12 }}>
        <span className={"pill " + (c.src === "forum" ? "ok" : "warn")}>{c.src === "forum" ? "реальный, с форума" : "сгенерирован"}</span>
        {c.category ? <span className="pill">{CAT[c.category] || c.category}</span> : null}
        <span className="pill">{CT[c.client_type] || c.client_type}</span>
        {c.lang ? <span className="pill">{String(c.lang).toUpperCase()}</span> : null}
        {c.country ? <span className="pill">{String(c.country)}</span> : null}
        {c.difficulty ? <span className="pill">сложность: {String(c.difficulty)}</span> : null}
        {c.expect_safety || c.expect_scam_warning ? <span className="pill bad">ловушка</span> : null}
      </div>
      <div className="lbl" style={{ marginBottom: 6 }}>Запрос банка{c.request_text_is === "reconstructed" ? " (восстановлен по рассказу человека)" : ""}</div>
      <pre className="raw" style={{ maxHeight: "none" }}>{c.bank_request_text}</pre>
      {c.user_context ? <><div className="lbl" style={{ margin: "14px 0 6px" }}>{c.src === "forum" ? "Ситуация человека" : "Что клиент пишет о себе"}</div><p style={{ margin: 0, maxWidth: "75ch" }}>{c.user_context}</p></> : null}
      {c.user_question ? <><div className="lbl" style={{ margin: "14px 0 6px" }}>Что он спрашивает</div><p style={{ margin: 0, maxWidth: "75ch" }}>{String(c.user_question)}</p></> : null}
      {c.outcome ? <><div className="lbl" style={{ margin: "14px 0 6px" }}>Чем закончилось</div><p style={{ margin: 0, maxWidth: "75ch" }}>{String(c.outcome)}</p></> : null}
      {c.trap ? <><div className="lbl" style={{ margin: "14px 0 6px" }}>Что кейс проверяет</div><p className="warnbox" style={{ margin: 0 }}>{c.trap}</p></> : null}
      {c.source_url ? <p className="note" style={{ marginTop: 10 }}>Источник: <a href={String(c.source_url)} target="_blank" rel="noreferrer">{String(c.forum || c.source_url)}</a></p> : null}
    </>
  );
}

export default function CasesPage() {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [filter, setFilter] = useState<"all" | "syn" | "forum" | "trap" | "mine">("all");
  const [q, setQ] = useState("");
  const [cur, setCur] = useState<string>("");
  const [all, setAll] = useState(false);
  const [notes, setNotes] = useState<Notes>({});

  useEffect(() => {
    setNotes(loadNotes());
    fetch("/api/cases").then(r => r.json()).then(d => { setCases(d.cases); setCur(d.cases[0]?.id || ""); });
  }, []);

  const hasNotes = (id: string) => Object.values(notes[id] || {}).some(v => v.trim());
  const shown = useMemo(() => cases.filter(c => {
    if (filter === "syn" && c.src !== "syn") return false;
    if (filter === "forum" && c.src !== "forum") return false;
    if (filter === "trap" && !(c.expect_safety || c.expect_scam_warning)) return false;
    if (filter === "mine" && !hasNotes(c.id)) return false;
    const s = q.trim().toLowerCase();
    return !s || [c.id, c.title, c.bank_request_text, c.user_context || ""].join(" ").toLowerCase().includes(s);
  }), [cases, filter, q, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = cases.find(x => x.id === cur);
  const idx = shown.findIndex(x => x.id === cur);
  const done = cases.filter(x => hasNotes(x.id)).length;

  function setNote(id: string, qid: string, v: string) {
    const n = { ...notes, [id]: { ...(notes[id] || {}), [qid]: v } };
    setNotes(n); saveNotes(n);
  }
  function download() {
    const out = cases.filter(x => hasNotes(x.id)).map(x => ({ caseId: x.id, title: x.title, ...notes[x.id] }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), questions: QUESTIONS, notes: out }, null, 1)], { type: "application/json" }));
    a.download = `expert-notes-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Кейсы</h1>
          <p className="sub">Все тестовые кейсы целиком. Под каждым кейсом — твой собственный разбор по 4 вопросам. Пиши его до того, как смотреть ответ модели: это эталон, по которому мы будем учить и проверять бота.</p>
        </div>
        <div className="actions">
          <span className="note">Разобрано: {done} из {cases.length}</span>
          <button type="button" className="btn ghost small" onClick={() => setAll(a => !a)}>{all ? "Один кейс" : "Показать все целиком"}</button>
          <button type="button" className="btn small" onClick={download} disabled={!done}>Скачать мои разборы</button>
        </div>
      </div>

      <div className="actions" style={{ marginBottom: 14 }}>
        <div className="seg" role="group" aria-label="Фильтр">
          {([["all", "Все"], ["syn", "Сгенерированные"], ["forum", "С форумов"], ["trap", "Ловушки"], ["mine", "Мои разборы"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <input type="text" aria-label="Поиск" placeholder="Поиск по тексту" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <span className="note">{shown.length} кейсов</span>
      </div>

      {all ? (
        <div style={{ display: "grid", gap: 16 }}>
          {shown.map(x => (
            <div className="panel" key={x.id} style={{ margin: 0 }}>
              <div className="actions" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}><span className="mono note">{x.id}</span> {x.title}</h2>
                <button type="button" className="btn ghost small" onClick={() => { setCur(x.id); setAll(false); window.scrollTo({ top: 0 }); }}>{hasNotes(x.id) ? "Мой разбор ✓" : "Разобрать"}</button>
              </div>
              <CaseBody c={x} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-cases">
          <nav className="panel" aria-label="Список кейсов" style={{ padding: 8 }}>
            <ul className="list case-nav">
              {shown.map(x => (
                <li key={x.id}>
                  <button type="button" onClick={() => setCur(x.id)} className="cellbtn"
                    style={{ gridTemplateColumns: "auto 1fr auto", display: "grid", gap: 8, padding: "7px 8px", background: x.id === cur ? "var(--accent-soft)" : undefined }}>
                    <span className="mono note">{x.id}</span>
                    <span style={{ fontSize: ".88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title}</span>
                    <span className="note">{hasNotes(x.id) ? "✓" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {c ? (
            <div style={{ minWidth: 0 }}>
              <div className="panel" style={{ margin: 0 }}>
                <div className="actions" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                  <h2 style={{ margin: 0 }}><span className="mono note">{c.id}</span> {c.title}</h2>
                  <div className="actions">
                    <button type="button" className="btn ghost small" disabled={idx <= 0} onClick={() => setCur(shown[idx - 1].id)}>← Пред.</button>
                    <button type="button" className="btn ghost small" disabled={idx < 0 || idx >= shown.length - 1} onClick={() => setCur(shown[idx + 1].id)}>След. →</button>
                  </div>
                </div>
                <CaseBody c={c} />
              </div>
              <div className="panel">
                <h2>Мой разбор</h2>
                <p className="note" style={{ marginTop: -6 }}>Сохраняется в этом браузере автоматически. Пиши как объяснял бы стажёру: коротко, своими словами.</p>
                {QUESTIONS.map(qq => (
                  <div className="field" key={qq.id}>
                    <label htmlFor={`n-${c.id}-${qq.id}`} style={{ textTransform: "none", letterSpacing: 0, fontSize: ".9rem", color: "var(--ink)" }}>{qq.label}</label>
                    <textarea id={`n-${c.id}-${qq.id}`} style={{ minHeight: 90 }} value={notes[c.id]?.[qq.id] || ""} onChange={e => setNote(c.id, qq.id, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
