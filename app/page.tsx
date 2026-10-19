"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ResultView from "@/components/ResultView";
import { tr } from "@/lib/i18n";
import type { AnalyzeResult, ClientType, Lang, TestCase } from "@/lib/types";

type PublicModel = { id: string; label: string; provider: string };

const SAMPLE_IDS = ["S01", "S07", "S16", "S03", "S29"];

export default function DecoderPage() {
  const [lang, setLang] = useState<Lang>("ru");
  const t = tr(lang);
  const [models, setModels] = useState<PublicModel[] | null>(null);
  const [modelId, setModelId] = useState("");
  const [samples, setSamples] = useState<TestCase[]>([]);
  const [request, setRequest] = useState("");
  const [context, setContext] = useState("");
  const [clientType, setClientType] = useState<ClientType>("individual");
  const [replyLang, setReplyLang] = useState<"same" | Lang>("same");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AnalyzeResult | null>(null);

  useEffect(() => {
    try { const l = localStorage.getItem("brd-lang") as Lang | null; if (l && ["en", "ru", "lv"].includes(l)) setLang(l); } catch {}
    fetch("/api/public-models").then(r => r.json()).then(s => {
      const ms = s.models as PublicModel[];
      setModels(ms);
      let saved = ""; try { saved = localStorage.getItem("brd-model") || ""; } catch {}
      setModelId(ms.find(m => m.id === saved)?.id || ms[0]?.id || "");
    });
    fetch("/api/cases").then(r => r.json()).then(d => setSamples(SAMPLE_IDS.map(id => (d.cases as TestCase[]).find(c => c.id === id)).filter(Boolean) as TestCase[]));
  }, []);

  function pickLang(l: Lang) { setLang(l); try { localStorage.setItem("brd-lang", l); } catch {} }
  function useSample(c: TestCase) { setRequest(c.bank_request_text); setContext(c.user_context || ""); setClientType(c.client_type); }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim() || !modelId) return;
    setBusy(true); setRes(null);
    try { localStorage.setItem("brd-model", modelId); } catch {}
    try {
      const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId, request, context, clientType, replyLang, uiLang: lang }) });
      setRes(await r.json());
    } catch (err) {
      setRes({ ok: false, error: String(err) } as AnalyzeResult);
    } finally { setBusy(false); }
  }

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <div className="note" style={{ fontFamily: "var(--f-mono)", textTransform: "uppercase", letterSpacing: ".08em" }}>{t("tag")}</div>
          <h1>{t("title")}</h1>
          <p className="sub">{t("subtitle")}</p>
        </div>
        <div className="seg" role="group" aria-label="Language">
          {(["en", "ru", "lv"] as Lang[]).map(l => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => pickLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {models && models.length === 0 ? (
        <div className="warnbox" style={{ marginBottom: 16 }}>
          {t("no_models")} <Link href="/settings">{t("go_settings")}</Link>
        </div>
      ) : null}

      <div className="grid2">
        <form className="panel" onSubmit={run} autoComplete="off">
          <h2>{t("h_input")}</h2>
          {samples.length ? (
            <div className="field">
              <span className="lbl">{t("samples")}</span>
              <div className="chips">{samples.map(s => <button type="button" className="chip" key={s.id} onClick={() => useSample(s)}>{s.title}</button>)}</div>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="req">{t("l_req")}</label>
            <textarea id="req" className="mono" style={{ minHeight: 200 }} value={request} onChange={e => setRequest(e.target.value)} required />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="ctype">{t("l_ctype")}</label>
              <select id="ctype" value={clientType} onChange={e => setClientType(e.target.value as ClientType)}>
                <option value="individual">{t("o_ind")}</option>
                <option value="company">{t("o_co")}</option>
                <option value="sole_trader">{t("o_st")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="rlang">{t("l_reply")}</label>
              <select id="rlang" value={replyLang} onChange={e => setReplyLang(e.target.value as "same" | Lang)}>
                <option value="same">{t("o_same")}</option>
                <option value="lv">Latviešu</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ctx">{t("l_ctx")}</label>
            <textarea id="ctx" style={{ minHeight: 90 }} placeholder={t("ctx_ph")} value={context} onChange={e => setContext(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="model">{t("l_model")}</label>
            <select id="model" value={modelId} onChange={e => setModelId(e.target.value)} disabled={!models?.length}>
              {(models || []).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy || !modelId || !request.trim()}>{t("b_go")}</button>
          </div>
          <div className="guard">{t("guard")}</div>
        </form>

        <div className="panel" aria-live="polite">
          <div className={"status" + (busy ? " busy" : res && !res.ok ? " err" : "")}>
            <span className="dot" />
            <span>{busy ? t("s_think") : res ? (res.ok ? t("s_done") : res.error) : t("s_ready")}</span>
            {res && res.ok ? <span>· {res.label} · {(res.latencyMs / 1000).toFixed(1)} s · ${res.costUsd.toFixed(4)}</span> : null}
          </div>
          {res?.ok && res.data ? <ResultView data={res.data} lang={lang} /> : !busy && !res ? <p className="note">{t("s_empty")}</p> : null}
          {res && !res.ok && res.raw ? <pre className="raw">{res.raw}</pre> : null}
        </div>
      </div>
    </main>
  );
}
