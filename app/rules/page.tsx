"use client";
import { useEffect, useState } from "react";

// Expert rules the bot receives with every request. Active = in use, draft = waiting for approval, off = disabled.

type Rule = { id: number; title: string; body: string; status: "draft" | "active" | "off"; review_id: number | null; updated_at: string };
const LABEL = { active: "Работает", draft: "Черновик", off: "Выключено" } as const;
const PILL = { active: "ok", draft: "warn", off: "" } as const;

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Record<number, { title: string; body: string }>>({});
  const [nt, setNt] = useState(""); const [nb, setNb] = useState("");

  const load = () => fetch("/api/rules").then(r => r.json()).then(d => { setRules(d.rules || []); setErr(d.ok ? "" : d.error); });
  useEffect(() => { load(); }, []);

  async function patch(id: number, body: Partial<Rule>) {
    await fetch("/api/rules/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setEdit(e => { const n = { ...e }; delete n[id]; return n; }); load();
  }
  async function del(id: number) { await fetch("/api/rules/" + id, { method: "DELETE" }); load(); }
  async function add() {
    if (!nt.trim() || !nb.trim()) return;
    await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: nt, body: nb, status: "active" }) });
    setNt(""); setNb(""); load();
  }
  const active = rules.filter(r => r.status === "active").length;

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Правила</h1>
          <p className="sub">Практические правила Андрея. Бот получает все работающие правила с каждым запросом, поэтому новое правило действует сразу. Черновики появляются из поправок на странице «Проверка».</p>
        </div>
        <span className="note">Работает: {active}</span>
      </div>
      {err ? <div className="alert" style={{ marginBottom: 14 }}>{err}</div> : null}

      <div style={{ display: "grid", gap: 14 }}>
        {rules.map(r => {
          const e = edit[r.id];
          return (
            <div className="panel" key={r.id} style={{ margin: 0, opacity: r.status === "off" ? 0.6 : 1 }}>
              <div className="actions" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <div className="actions"><span className={"pill " + PILL[r.status]}>{LABEL[r.status]}</span><span className="note">№ {r.id}{r.review_id ? " · из поправки" : ""}</span></div>
                <div className="actions">
                  {r.status !== "active" ? <button type="button" className="btn small" onClick={() => patch(r.id, { status: "active" })}>{r.status === "draft" ? "Утвердить" : "Включить"}</button> : <button type="button" className="btn ghost small" onClick={() => patch(r.id, { status: "off" })}>Выключить</button>}
                  {!e ? <button type="button" className="btn ghost small" onClick={() => setEdit({ ...edit, [r.id]: { title: r.title, body: r.body } })}>Изменить</button> : null}
                  {r.status !== "active" ? <button type="button" className="btn danger small" onClick={() => del(r.id)}>Удалить</button> : null}
                </div>
              </div>
              {e ? (
                <>
                  <input type="text" aria-label="Название" value={e.title} onChange={x => setEdit({ ...edit, [r.id]: { ...e, title: x.target.value } })} style={{ marginBottom: 8 }} />
                  <textarea aria-label="Текст" value={e.body} onChange={x => setEdit({ ...edit, [r.id]: { ...e, body: x.target.value } })} style={{ minHeight: 120 }} />
                  <div className="actions" style={{ marginTop: 8 }}>
                    <button type="button" className="btn small" onClick={() => patch(r.id, e)}>Сохранить</button>
                    <button type="button" className="btn ghost small" onClick={() => setEdit(x => { const n = { ...x }; delete n[r.id]; return n; })}>Отмена</button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ marginBottom: 4 }}>{r.title}</h3>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", maxWidth: "80ch" }}>{r.body}</p>
                </>
              )}
            </div>
          );
        })}

        <div className="panel" style={{ margin: 0 }}>
          <h2>Добавить правило вручную</h2>
          <input type="text" aria-label="Название нового правила" placeholder="Коротко: о чём правило" value={nt} onChange={e => setNt(e.target.value)} style={{ marginBottom: 8 }} />
          <textarea aria-label="Текст нового правила" placeholder="Когда применяется, что бот должен проверить и что сказать клиенту" value={nb} onChange={e => setNb(e.target.value)} style={{ minHeight: 100 }} />
          <div className="actions" style={{ marginTop: 8 }}><button type="button" className="btn" disabled={!nt.trim() || !nb.trim()} onClick={add}>Добавить и включить</button></div>
        </div>
      </div>
    </main>
  );
}
