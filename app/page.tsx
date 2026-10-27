"use client";
import { useEffect, useState } from "react";
import AnalysisView from "@/components/AnalysisView";
import type { AnalysisV2 } from "@/lib/agents";

type L = "ru" | "en" | "lv";
const T: Record<L, Record<string, string>> = {
  ru: { title: "Разбор вашей ситуации", sub: "Опишите ситуацию или вставьте запрос банка. Помощник объяснит риски (бенефициары, источник средств, санкции ЕС), какие документы нужны, что сделать и как ответить банку.",
    facts: "Ситуация или запрос банка (уберите имена, номера счетов, персональные коды)", factsPh: "Например: я гражданин Латвии и директор ООО в России, компания занимается строительством. Банк просит пояснить мою роль в этой компании…",
    question: "Ваш вопрос (необязательно)", ctype: "Кто вы", ind: "Частное лицо", co: "Компания", st: "Самозанятый", go: "Разобрать", busy: "Анализирую… обычно до минуты", empty: "Здесь появится разбор.",
    guard: "Помощник объясняет и подсказывает. Он не принимает решений за банк, не заменяет юриста и не помогает скрывать сведения." },
  en: { title: "Your situation, explained", sub: "Describe your situation or paste the bank's request. The assistant explains the risks (beneficial owners, source of funds, EU sanctions), the documents needed, what to do and how to answer the bank.",
    facts: "Situation or bank request (remove names, account numbers, personal codes)", factsPh: "E.g. I am a Latvian citizen and director of an LLC in Russia that does construction. The bank asks me to explain my role…",
    question: "Your question (optional)", ctype: "You are", ind: "Individual", co: "Company", st: "Self-employed", go: "Analyse", busy: "Analysing… usually under a minute", empty: "The analysis will appear here.",
    guard: "The assistant explains and advises. It does not decide for the bank, does not replace a lawyer and does not help hide information." },
  lv: { title: "Jūsu situācijas analīze", sub: "Aprakstiet situāciju vai ielīmējiet bankas pieprasījumu. Asistents izskaidros riskus (patiesie labuma guvēji, līdzekļu izcelsme, ES sankcijas), vajadzīgos dokumentus, ko darīt un kā atbildēt bankai.",
    facts: "Situācija vai bankas pieprasījums (izņemiet vārdus, kontu numurus, personas kodus)", factsPh: "Piemēram: esmu Latvijas pilsonis un Krievijas SIA valdes loceklis, uzņēmums nodarbojas ar būvniecību…",
    question: "Jūsu jautājums (nav obligāti)", ctype: "Jūs esat", ind: "Fiziska persona", co: "Uzņēmums", st: "Pašnodarbinātais", go: "Analizēt", busy: "Analizēju… parasti līdz minūtei", empty: "Šeit parādīsies analīze.",
    guard: "Asistents skaidro un iesaka. Tas nepieņem lēmumus bankas vietā, neaizstāj juristu un nepalīdz slēpt informāciju." },
};

export default function Home() {
  const [lang, setLang] = useState<L>("ru");
  const t = T[lang];
  const [facts, setFacts] = useState("");
  const [question, setQuestion] = useState("");
  const [clientType, setClientType] = useState("individual");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; data?: AnalysisV2; error?: string } | null>(null);

  useEffect(() => { try { const l = localStorage.getItem("brd-lang") as L | null; if (l && T[l]) setLang(l); } catch {} }, []);
  function pick(l: L) { setLang(l); try { localStorage.setItem("brd-lang", l); } catch {} }

  async function go(e: React.FormEvent) {
    e.preventDefault(); if (!facts.trim()) return;
    setBusy(true); setRes(null);
    try { setRes(await (await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts, question, clientType, lang }) })).json()); }
    catch (err) { setRes({ ok: false, error: String(err) }); }
    finally { setBusy(false); }
  }

  return (
    <main className="wrap">
      <div className="pagehead">
        <div><h1>{t.title}</h1><p className="sub">{t.sub}</p></div>
        <div className="seg" role="group" aria-label="Language">
          {(["en", "ru", "lv"] as L[]).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => pick(l)}>{l.toUpperCase()}</button>)}
        </div>
      </div>
      <div className="grid2">
        <form className="panel" onSubmit={go}>
          <div className="field"><label htmlFor="facts">{t.facts}</label>
            <textarea id="facts" style={{ minHeight: 240 }} placeholder={t.factsPh} value={facts} onChange={e => setFacts(e.target.value)} required /></div>
          <div className="field"><label htmlFor="q">{t.question}</label>
            <textarea id="q" style={{ minHeight: 70 }} value={question} onChange={e => setQuestion(e.target.value)} /></div>
          <div className="field"><label htmlFor="ct">{t.ctype}</label>
            <select id="ct" value={clientType} onChange={e => setClientType(e.target.value)}>
              <option value="individual">{t.ind}</option><option value="company">{t.co}</option><option value="sole_trader">{t.st}</option>
            </select></div>
          <button className="btn" type="submit" disabled={busy || !facts.trim()}>{t.go}</button>
          <div className="guard">{t.guard}</div>
        </form>
        <div className="panel" aria-live="polite">
          {busy ? <div className="status busy"><span className="dot" /><span>{t.busy}</span></div> : null}
          {res?.ok && res.data ? <AnalysisView data={res.data} lang={lang} ctx={{ facts, question }} /> : null}
          {res && !res.ok ? <div className="alert">{res.error}</div> : null}
          {!busy && !res ? <p className="note">{t.empty}</p> : null}
        </div>
      </div>
    </main>
  );
}
