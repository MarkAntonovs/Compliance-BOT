"use client";
import { useEffect, useState } from "react";
import type { Analysis, Lang } from "@/lib/types";
import { tr } from "@/lib/i18n";

const arr = <T,>(v: T[] | T | null | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

export default function ResultView({ data, lang = "ru" }: { data: Analysis; lang?: Lang }) {
  const t = tr(lang);
  const [draft, setDraft] = useState(data.draft_reply || "");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(data.draft_reply || ""); }, [data]);
  const items = arr(data.requested_items);

  async function copy() {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select manually */ }
  }

  return (
    <div className="out">
      {data.safety_note ? <section><div className="alert">{t("safety")}: {data.safety_note}</div></section> : null}
      <section>
        <h3>{t("h_sum")}</h3>
        <p className="summary">{data.plain_language_summary}</p>
        <div className="meta">
          {arr(data.request_types).map(x => <span key={x} className="pill">{String(x).replace(/_/g, " ")}</span>)}
          {data.deadline ? <span className="pill warn">{t("deadline")}: {data.deadline}</span> : null}
        </div>
      </section>
      <section>
        <h3>{t("h_items")} <span className="count">{items.length}</span></h3>
        <div className="items">
          {items.map((it, i) => {
            const st = ["have", "missing", "unclear"].includes(it.status) ? it.status : "unclear";
            return (
              <div className="item" key={i}>
                <div className="item-head">
                  <span className="item-title">{it.item}</span>
                  <span className={"pill " + (st === "have" ? "ok" : st === "missing" ? "bad" : "warn")}>{t("st_" + st)}</span>
                </div>
                <dl className="kv">
                  <dt>{t("k_why")}</dt><dd>{it.why_requested}</dd>
                  <dt>{t("k_ev")}</dt><dd><ul className="plain">{arr(it.possible_evidence).map((e, j) => <li key={j}>{e}</li>)}</ul></dd>
                  {it.what_to_clarify ? (<><dt>{t("k_cl")}</dt><dd>{it.what_to_clarify}</dd></>) : null}
                </dl>
              </div>
            );
          })}
        </div>
      </section>
      {arr(data.questions_for_user).length ? (
        <section><h3>{t("h_q")}</h3><ul className="plain">{arr(data.questions_for_user).map((q, i) => <li key={i}>{q}</li>)}</ul></section>
      ) : null}
      {data.draft_reply ? (
        <section>
          <h3>{t("h_draft")}</h3>
          <div className="draft-bar">
            <span className="note">{t("draft_note")}</span>
            <button type="button" className="btn ghost small" onClick={copy}>{copied ? t("copied") : t("copy")}</button>
          </div>
          <textarea className="draft" aria-label={t("h_draft")} value={draft} onChange={e => setDraft(e.target.value)} />
        </section>
      ) : null}
      <section><h3>{t("h_check")}</h3><ul className="plain">{arr(data.check_before_sending).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
      <section>
        <h3>{t("h_unc")}</h3>
        {arr(data.uncertainties).length ? <ul className="plain">{arr(data.uncertainties).map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="note">{t("none")}</p>}
      </section>
    </div>
  );
}
