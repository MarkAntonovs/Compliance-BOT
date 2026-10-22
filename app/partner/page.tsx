"use client";
import { useEffect, useState } from "react";
import { findCompanies, gatherRegistry } from "@/lib/lvregister";

// Partner check: Latvian register → everyone connected → official sanctions lists → AI risk report.

type ListRow = { id: string; label: string; info: string; updated_at?: string; entries?: number; names?: number; error?: string | null; checked_at?: string };
type Company = { regcode: string; name: string; type: string; registered: string; terminated: string; address: string };
type LvParty = { name: string; role: string; details: Record<string, string> };
type Registry = { company: Company; officers: LvParty[]; ubos: LvParty[]; members: LvParty[]; warnings: string[] } | null;
type Hit = { list: string; ref: string; matched: string; primary: string; kind: string; programme: string; details: Record<string, string>; score: number; strength: "strong" | "possible" | "weak" };
type Screened = { name: string; role: string; hits: Hit[] };
type Report = {
  summary: string; risk_level: "low" | "medium" | "high"; recommendation: string;
  sanctions_matches?: { screened_name: string; matched_name: string; list: string; assessment: string; why: string }[];
  ownership?: string; findings?: { title: string; explanation: string; legal_basis?: string; severity: string }[];
  documents_to_request?: { document: string; why: string }[]; actions?: string[]; open_questions?: string[];
};
type Result = { id?: number; title?: string; created_at?: string; registry: Registry; screened: Screened[]; report: Report | null; error?: string | null; warnings: string[]; costUsd: number; model?: string; lists?: { label: string; updated_at?: string; entries?: number }[] };
type CheckRow = { id: number; title: string; created_at: string; risk_level?: string; recommendation?: string; with_hits: number; error?: string };

const LIST_SHORT: Record<string, string> = { eu: "ЕС", un: "ООН", ofac: "OFAC", uk: "UK" };
const REC: Record<string, [string, string]> = {
  proceed: ["Можно работать", "ok"], proceed_with_care: ["Можно, с осторожностью", "warn"],
  need_more_info: ["Нужно больше информации", "warn"], do_not_proceed: ["Не рекомендуется", "bad"],
};
const RISK: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий" };
const ASSESS: Record<string, [string, string]> = { likely_same: ["скорее тот же", "bad"], possible: ["возможно", "warn"], unlikely: ["скорее другой", "ok"] };
const STRENGTH: Record<string, [string, string]> = { strong: ["сильное", "bad"], possible: ["возможное", "warn"], weak: ["слабое", ""] };
const sev = (s: string) => (s === "high" ? "bad" : s === "medium" ? "warn" : "ok");
const arr = <X,>(v: X[] | undefined | null) => (Array.isArray(v) ? v : []);
const date = (s?: string) => (s ? new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "");

export default function PartnerPage() {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [listErr, setListErr] = useState("");
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string[]>([]);

  const [country, setCountry] = useState<"LV" | "other">("LV");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Company[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Company | null>(null);
  const [notes, setNotes] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [checks, setChecks] = useState<CheckRow[]>([]);

  const loadLists = () => fetch("/api/sanctions").then(r => r.json()).then(d => { setLists(d.lists || []); setListErr(d.ok ? "" : d.error); }).catch(e => setListErr(String(e)));
  const loadChecks = () => fetch("/api/partner/checks").then(r => r.json()).then(d => setChecks(d.checks || [])).catch(() => {});
  useEffect(() => {
    loadLists(); loadChecks();
    const id = new URLSearchParams(location.search).get("check");
    if (id) openCheck(Number(id));
  }, []);

  async function openCheck(id: number) {
    setErr(""); const d = await (await fetch("/api/partner/checks/" + id)).json();
    if (d.ok) { setRes(d); history.replaceState(null, "", "?check=" + id); window.scrollTo({ top: 0, behavior: "smooth" }); } else setErr(d.error);
  }

  async function refreshAll() {
    setRefreshMsg([]);
    for (const l of lists) {
      setRefreshing(l.id);
      try {
        const d = await (await fetch("/api/sanctions/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ list: l.id }) })).json();
        setRefreshMsg(m => [...m, d.ok ? `${LIST_SHORT[l.id]}: ${d.entries} записей, ${d.names} имён (${d.seconds} с)` : `${LIST_SHORT[l.id]}: ошибка — ${d.error}`]);
      } catch (e) { setRefreshMsg(m => [...m, `${LIST_SHORT[l.id]}: ошибка — ${e}`]); }
      await loadLists();
    }
    setRefreshing(null);
  }

  async function find() {
    setSearching(true); setFound(null); setPicked(null); setErr("");
    // data.gov.lv blocks cloud servers, so ask it straight from the browser; the server is only a fallback.
    let d: { ok: boolean; companies?: Company[]; error?: string };
    try { d = { ok: true, companies: await findCompanies(q) }; }
    catch (e1) {
      d = await (await fetch("/api/partner/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) })).json().catch(e => ({ ok: false, error: String(e) }));
      if (!d.ok) d.error = `Реестр Латвии не ответил ни браузеру (${e1 instanceof Error ? e1.message : e1}), ни серверу (${d.error}).`;
    }
    setSearching(false);
    if (!d.ok || !d.companies) { setErr(d.error || "Ошибка"); return; }
    setFound(d.companies);
    if (d.companies.length === 1) setPicked(d.companies[0]);
  }

  async function check() {
    setBusy(true); setErr(""); setRes(null);
    const regcode = country === "LV" ? (picked?.regcode || (/^\d{11}$/.test(q.trim()) ? q.trim() : undefined)) : undefined;
    const name = picked?.name || q;
    // Register data is collected here in the browser (data.gov.lv does not answer cloud servers).
    const registry = country === "LV" ? { ...(await gatherRegistry({ regcode, name })), source: "browser" as const } : undefined;
    const body = { country, regcode, name, notes, extraNames: extra, registry };
    const d = await (await fetch("/api/partner/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json().catch(e => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (d.registry !== undefined) { setRes(d); if (d.id) history.replaceState(null, "", "?check=" + d.id); loadChecks(); }
    if (!d.ok && d.error) setErr(d.error);
  }

  const loaded = lists.filter(l => l.entries).length;
  const canCheck = !busy && loaded > 0 && (country === "LV" ? !!picked || q.trim().length > 1 : q.trim().length > 1);

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Проверка партнёра</h1>
          <p className="sub">Находим компанию в реестре Латвии, берём её правление, участников и бенефициаров, проверяем всех по официальным санкционным спискам ЕС, ООН, США и Великобритании, и ИИ пишет вывод о рисках.</p>
        </div>
      </div>

      <div className="panel">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Санкционные списки</h2>
          <button type="button" className="btn ghost small" disabled={!!refreshing || !lists.length} onClick={refreshAll}>{refreshing ? `Обновляю: ${LIST_SHORT[refreshing]}…` : "Обновить списки"}</button>
        </div>
        {listErr ? <div className="alert" style={{ marginTop: 10 }}>{listErr}</div> : null}
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Список</th><th className="num">Записей</th><th>Обновлён</th><th></th></tr></thead>
            <tbody>
              {lists.map(l => (
                <tr key={l.id}>
                  <td><a href={l.info} target="_blank" rel="noreferrer">{l.label}</a></td>
                  <td className="num">{l.entries || "—"}</td>
                  <td>{l.updated_at ? date(l.updated_at) : <span className="note">не загружен</span>}</td>
                  <td>{l.error ? <span className="note" style={{ color: "var(--bad)" }}>{l.error}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {refreshMsg.length ? <ul className="plain note" style={{ marginTop: 8 }}>{refreshMsg.map((m, i) => <li key={i}>{m}</li>)}</ul> : null}
        <p className="note" style={{ marginBottom: 0 }}>Списки обновляются сами каждую ночь. Первый раз нажмите «Обновить списки» — это займёт 1–3 минуты.</p>
      </div>

      <div className="panel">
        <h2>Кого проверяем</h2>
        <div className="field">
          <span className="lbl">Страна партнёра</span>
          <div className="actions">
            <label className="checkrow"><input type="radio" checked={country === "LV"} onChange={() => { setCountry("LV"); setFound(null); setPicked(null); }} /> <span>Латвия — найти в реестре</span></label>
            <label className="checkrow"><input type="radio" checked={country === "other"} onChange={() => { setCountry("other"); setFound(null); setPicked(null); }} /> <span>Другая страна</span></label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="pq">{country === "LV" ? "Название или регистрационный номер (11 цифр)" : "Название компании или имя человека"}</label>
          <div className="actions" style={{ flexWrap: "nowrap" }}>
            <input id="pq" type="text" value={q} onChange={e => { setQ(e.target.value); setPicked(null); }} onKeyDown={e => { if (e.key === "Enter" && country === "LV" && q.trim().length > 1) find(); }}
              placeholder={country === "LV" ? "например: 40003000000 или Baltic Trade" : "например: OOO Stroy-Alfa или Ivan Petrov"} />
            {country === "LV" ? <button type="button" className="btn ghost" disabled={searching || q.trim().length < 2} onClick={find}>{searching ? "Ищу…" : "Найти"}</button> : null}
          </div>
        </div>
        {country === "LV" && found ? (
          found.length ? (
            <ul className="list" style={{ marginBottom: 12 }}>
              {found.map(c => (
                <li key={c.regcode}><label className="checkrow"><input type="radio" checked={picked?.regcode === c.regcode} onChange={() => setPicked(c)} />
                  <span><b>{c.name}</b> <span className="note mono">{c.regcode}</span> <span className="note">{c.type}{c.terminated ? " · ликвидирована " + c.terminated : ""}{c.address ? " · " + c.address : ""}</span></span></label></li>
              ))}
            </ul>
          ) : <p className="note">В реестре ничего не нашлось. Можно проверить просто по названию — выберите «Другая страна».</p>
        ) : null}
        <details style={{ marginBottom: 12 }} open={country === "other"}>
          <summary style={{ cursor: "pointer" }}><strong>Что ещё известно о партнёре</strong> <span className="note">— выписка ЕГРЮЛ, владельцы, директора, сайт, что продаёт</span></summary>
          <div style={{ marginTop: 10 }}>
            <div className="field"><label htmlFor="pn">Описание или вставленная выписка (ИИ сам вытащит из неё имена владельцев и директоров)</label>
              <textarea id="pn" style={{ minHeight: 140 }} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div className="field"><label htmlFor="pe">Дополнительные имена для проверки — по одному в строке</label>
              <textarea id="pe" style={{ minHeight: 70 }} value={extra} onChange={e => setExtra(e.target.value)} /></div>
          </div>
        </details>
        <div className="actions">
          <button type="button" className="btn" disabled={!canCheck} onClick={check}>{busy ? "Проверяю… (до минуты)" : "Проверить партнёра"}</button>
          {!loaded ? <span className="note">Сначала загрузите санкционные списки.</span> : country === "LV" && !picked ? <span className="note">Найдите и выберите компанию — тогда проверим и её людей из реестра.</span> : null}
        </div>
        {err ? <div className="alert" style={{ marginTop: 12 }}>{err}</div> : null}
      </div>

      {res ? <ResultView r={res} /> : null}

      {checks.length ? (
        <div className="panel">
          <h2>Прошлые проверки</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Партнёр</th><th>Вывод</th><th className="num">Имён с совпадениями</th><th>Когда</th></tr></thead>
              <tbody>
                {checks.map(c => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => openCheck(c.id)}>
                    <td><a href={"?check=" + c.id} onClick={e => { e.preventDefault(); openCheck(c.id); }}>{c.title}</a></td>
                    <td>{c.recommendation && REC[c.recommendation] ? <span className={"pill " + REC[c.recommendation][1]}>{REC[c.recommendation][0]}</span> : c.error ? <span className="pill bad">ошибка</span> : "—"}</td>
                    <td className="num">{c.with_hits}</td>
                    <td className="note">{date(c.created_at)}</td>
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

function ResultView({ r }: { r: Result }) {
  const rep = r.report;
  const withHits = arr(r.screened).filter(s => s.hits.length);
  const reg = r.registry;
  return (
    <>
      <div className="panel">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{r.title || reg?.company.name || "Результат"}</h2>
          <span className="note mono">{r.created_at ? date(r.created_at) + " · " : ""}${Number(r.costUsd || 0).toFixed(3)}{r.model ? " · " + r.model : ""}</span>
        </div>
        {arr(r.warnings).length ? <div className="warnbox" style={{ marginTop: 10 }}><ul className="plain">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div> : null}
        {r.error ? <div className="alert" style={{ marginTop: 10 }}>Вывод ИИ не получился: {r.error}. Совпадения и данные реестра ниже — настоящие.</div> : null}
        {rep ? (
          <div className="out" style={{ marginTop: 12 }}>
            <section>
              <h3>
                Вывод{" "}
                {REC[rep.recommendation] ? <span className={"pill " + REC[rep.recommendation][1]}>{REC[rep.recommendation][0]}</span> : null}{" "}
                <span className={"pill " + sev(rep.risk_level)}>Риск: {RISK[rep.risk_level] || rep.risk_level}</span>
              </h3>
              <p className="summary">{rep.summary}</p>
            </section>
            {arr(rep.sanctions_matches).length ? (
              <section>
                <h3>Совпадения в списках — оценка</h3>
                <div className="items">
                  {rep.sanctions_matches!.map((m, i) => (
                    <div className="item" key={i}>
                      <div className="item-head"><span className="item-title">{m.screened_name} → {m.matched_name} <span className="note">({LIST_SHORT[m.list] || m.list})</span></span>
                        <span className={"pill " + (ASSESS[m.assessment]?.[1] || "")}>{ASSESS[m.assessment]?.[0] || m.assessment}</span></div>
                      <p style={{ margin: 0, fontSize: ".92rem" }}>{m.why}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {rep.ownership ? <section><h3>Владение и контроль</h3><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{rep.ownership}</p></section> : null}
            {arr(rep.findings).length ? (
              <section>
                <h3>Риски</h3>
                <div className="items">
                  {rep.findings!.map((f, i) => (
                    <div className="item" key={i}>
                      <div className="item-head"><span className="item-title">{f.title}</span><span className={"pill " + sev(f.severity)}>{RISK[f.severity] || f.severity}</span></div>
                      <p style={{ margin: 0, fontSize: ".92rem" }}>{f.explanation}</p>
                      {f.legal_basis ? <p className="note" style={{ margin: 0 }}>Основание: {f.legal_basis}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {arr(rep.documents_to_request).length ? (
              <section><h3>Что запросить у партнёра</h3>
                <ul className="plain">{rep.documents_to_request!.map((d, i) => <li key={i}><b>{d.document}</b> — {d.why}</li>)}</ul></section>
            ) : null}
            {arr(rep.actions).length ? <section><h3>Что сделать</h3><ol className="plain" style={{ paddingLeft: "1.3em" }}>{rep.actions!.map((x, i) => <li key={i}>{x}</li>)}</ol></section> : null}
            {arr(rep.open_questions).length ? <section><h3>Что пока неясно</h3><ul className="plain">{rep.open_questions!.map((x, i) => <li key={i}>{x}</li>)}</ul></section> : null}
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>Проверено по спискам: {arr(r.screened).length} имён, с совпадениями — {withHits.length}</h2>
        {arr(r.screened).length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Кого проверяли</th><th>Совпадения</th></tr></thead>
              <tbody>
                {r.screened.map((s, i) => (
                  <tr key={i}>
                    <td><b>{s.name}</b><br /><span className="note">{s.role}</span></td>
                    <td>{s.hits.length ? (
                      <ul className="plain" style={{ margin: 0 }}>
                        {s.hits.map((h, j) => (
                          <li key={j} style={{ marginBottom: 6 }}>
                            <span className={"pill " + STRENGTH[h.strength][1]}>{STRENGTH[h.strength][0]} {Math.round(h.score * 100)}%</span>{" "}
                            <b>{LIST_SHORT[h.list] || h.list}</b>: {h.matched}{h.primary && h.primary !== h.matched ? <span className="note"> (основное имя: {h.primary})</span> : null}
                            <span className="note"> · {h.kind}{h.programme ? " · " + h.programme : ""}{h.details?.birth_date ? " · д.р. " + h.details.birth_date : ""}{h.details?.citizenship || h.details?.nationality ? " · " + (h.details.citizenship || h.details.nationality) : ""}</span>
                          </li>
                        ))}
                      </ul>) : <span className="pill ok">нет</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {arr(r.lists).length ? <p className="note" style={{ marginBottom: 0 }}>Списки: {r.lists!.map(l => `${l.label}${l.updated_at ? " от " + date(l.updated_at) : " — не загружен"}`).join("; ")}</p> : null}
      </div>

      {reg ? (
        <div className="panel">
          <h2>Реестр Латвии</h2>
          <p style={{ marginTop: 0 }}><b>{reg.company.name}</b> <span className="mono note">{reg.company.regcode}</span><br />
            <span className="note">{reg.company.type}{reg.company.registered ? " · зарегистрирована " + reg.company.registered : ""}{reg.company.terminated ? " · ликвидирована " + reg.company.terminated : ""}{reg.company.address ? " · " + reg.company.address : ""}</span></p>
          {([["Должностные лица", reg.officers], ["Бенефициары (PLG)", reg.ubos], ["Участники", reg.members]] as const).map(([label, rows]) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <h3 style={{ marginBottom: 4 }}>{label} <span className="count">{rows.length}</span></h3>
              {rows.length ? <ul className="plain">{rows.map((p, i) => <li key={i}><b>{p.name}</b> <span className="note">{p.role}{Object.entries(p.details).filter(([k]) => k !== "registered_on").map(([k, v]) => ` · ${k}: ${v}`).join("")}</span></li>)}</ul>
                : <p className="note" style={{ margin: 0 }}>нет данных</p>}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
