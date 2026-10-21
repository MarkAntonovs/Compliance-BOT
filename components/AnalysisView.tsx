"use client";
import { useEffect, useState } from "react";
import type { AnalysisV2 } from "@/lib/agents";

type L = "ru" | "en" | "lv";
const T: Record<L, Record<string, string>> = {
  ru: { summary: "Коротко", risk: "Уровень риска", low: "низкий", medium: "средний", high: "высокий", findings: "Что важно", basis: "Основание", ownership: "Владение и контроль", docs: "Какие документы нужны", why: "Зачем", where: "Где взять", actions: "Что сделать", q: "Вопросы к вам", reply: "Черновик ответа банку", copy: "Скопировать", copied: "Скопировано", open: "Что пока неясно" },
  en: { summary: "Summary", risk: "Risk level", low: "low", medium: "medium", high: "high", findings: "What matters", basis: "Basis", ownership: "Ownership and control", docs: "Documents needed", why: "Why", where: "Where to get it", actions: "What to do", q: "Questions for you", reply: "Draft reply to the bank", copy: "Copy", copied: "Copied", open: "Still unclear" },
  lv: { summary: "Īsumā", risk: "Riska līmenis", low: "zems", medium: "vidējs", high: "augsts", findings: "Kas svarīgs", basis: "Pamatojums", ownership: "Īpašumtiesības un kontrole", docs: "Nepieciešamie dokumenti", why: "Kāpēc", where: "Kur iegūt", actions: "Kas jādara", q: "Jautājumi jums", reply: "Atbildes melnraksts bankai", copy: "Kopēt", copied: "Nokopēts", open: "Vēl neskaidrs" },
};
const arr = <X,>(v: X[] | undefined | null) => (Array.isArray(v) ? v : []);
const sev = (s: string) => (s === "high" ? "bad" : s === "medium" ? "warn" : "ok");

export default function AnalysisView({ data, lang = "ru" }: { data: AnalysisV2; lang?: L }) {
  const t = T[lang];
  const [reply, setReply] = useState(data.reply_to_bank || "");
  const [copied, setCopied] = useState(false);
  useEffect(() => setReply(data.reply_to_bank || ""), [data]);
  return (
    <div className="out">
      <section>
        <h3>{t.summary} <span className={"pill " + sev(data.risk_level)}>{t.risk}: {t[data.risk_level] || data.risk_level}</span></h3>
        <p className="summary">{data.summary}</p>
      </section>
      {arr(data.findings).length ? (
        <section>
          <h3>{t.findings} <span className="count">{data.findings.length}</span></h3>
          <div className="items">
            {data.findings.map((f, i) => (
              <div className="item" key={i}>
                <div className="item-head"><span className="item-title">{f.title}</span><span className={"pill " + sev(f.severity)}>{t[f.severity] || f.severity}</span></div>
                <p style={{ margin: 0, fontSize: ".92rem" }}>{f.explanation}</p>
                {f.legal_basis ? <p className="note" style={{ margin: 0 }}>{t.basis}: {f.legal_basis}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {data.ownership ? <section><h3>{t.ownership}</h3><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.ownership}</p></section> : null}
      {arr(data.documents_needed).length ? (
        <section>
          <h3>{t.docs}</h3>
          <div className="items">
            {data.documents_needed.map((d, i) => (
              <div className="item" key={i}>
                <span className="item-title">{d.document}</span>
                <dl className="kv"><dt>{t.why}</dt><dd>{d.why}</dd><dt>{t.where}</dt><dd>{d.where_to_get}</dd></dl>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {arr(data.actions).length ? <section><h3>{t.actions}</h3><ol className="plain" style={{ paddingLeft: "1.3em" }}>{data.actions.map((x, i) => <li key={i}>{x}</li>)}</ol></section> : null}
      {arr(data.questions_for_client).length ? <section><h3>{t.q}</h3><ul className="plain">{data.questions_for_client.map((x, i) => <li key={i}>{x}</li>)}</ul></section> : null}
      {data.reply_to_bank ? (
        <section>
          <div className="draft-bar"><h3 style={{ margin: 0 }}>{t.reply}</h3>
            <button type="button" className="btn ghost small" onClick={() => navigator.clipboard.writeText(reply).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}>{copied ? t.copied : t.copy}</button></div>
          <textarea className="draft" value={reply} onChange={e => setReply(e.target.value)} aria-label={t.reply} />
        </section>
      ) : null}
      {arr(data.open_questions).length ? <section><h3>{t.open}</h3><ul className="plain">{data.open_questions.map((x, i) => <li key={i}>{x}</li>)}</ul></section> : null}
    </div>
  );
}
