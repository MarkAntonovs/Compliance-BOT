"use client";
import { useEffect, useState } from "react";
import type { ModelEntry, ProviderId } from "@/lib/types";

type ProviderInfo = { id: ProviderId; name: string; keyUrl: string; keyHint: string };
type KeyState = Record<string, { set: boolean; preview: string; source?: string }>;
type ModelInfo = { id: string; priceIn?: number; priceOut?: number };

const newId = () => "m_" + Math.random().toString(36).slice(2, 8);

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [demo, setDemo] = useState<ProviderInfo | null>(null);
  const allProviders = demo ? [...providers, demo] : providers;
  const [keys, setKeys] = useState<KeyState>({});
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [available, setAvailable] = useState<Record<string, ModelInfo[]>>({});
  const [check, setCheck] = useState<Record<string, { ok: boolean; msg: string } | "busy">>({});
  const [msg, setMsg] = useState("");
  const [server, setServer] = useState(false);

  async function load() {
    const s = await (await fetch("/api/settings")).json();
    setProviders(s.providers); setDemo(s.demo); setKeys(s.keys); setModels(s.models); setServer(!!s.onServer);
  }
  useEffect(() => { load(); }, []);

  async function saveKey(p: ProviderId, value: string) {
    const r = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys: { [p]: value } }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setCheck(c => ({ ...c, [p]: { ok: false, msg: j.error || "Не удалось сохранить" } })); return; }
    setDraftKeys(d => ({ ...d, [p]: "" }));
    await load();
    if (value) testKey(p);
  }

  async function testKey(p: ProviderId) {
    setCheck(c => ({ ...c, [p]: "busy" }));
    const r = await (await fetch("/api/models?provider=" + p)).json();
    if (r.ok) {
      setAvailable(a => ({ ...a, [p]: r.models }));
      setCheck(c => ({ ...c, [p]: { ok: true, msg: `Подключено. Доступно моделей: ${r.models.length}` } }));
    } else setCheck(c => ({ ...c, [p]: { ok: false, msg: r.error } }));
  }

  function setModel(id: string, patch: Partial<ModelEntry>) {
    setModels(ms => ms.map(m => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch };
      // Auto-fill prices when OpenRouter tells us them
      if (patch.model) {
        const info = available[next.provider]?.find(x => x.id === patch.model);
        if (info?.priceIn != null) next.priceIn = info.priceIn;
        if (info?.priceOut != null) next.priceOut = info.priceOut;
      }
      return next;
    }));
  }
  function addModel(provider: ProviderId) {
    setModels(ms => [...ms, { id: newId(), provider, model: "", label: "", priceIn: 0, priceOut: 0, enabled: true }]);
    if (keys[provider]?.set && !available[provider]) testKey(provider);
  }
  async function saveModels() {
    const r = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ models }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Модели сохранены в data/models.json. Закоммитьте файл в GitHub, чтобы сайт на Vercel их увидел." : (j.error || "Не удалось сохранить")); setTimeout(() => setMsg(""), 8000);
    load();
  }

  const keyRow = (p: ProviderInfo) => {
                const c = check[p.id];
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><br /><a href={p.keyUrl} target="_blank" rel="noreferrer" className="note">где взять ключ ↗</a></td>
                    <td className="mono">{keys[p.id]?.set ? <>{keys[p.id].preview}{keys[p.id].source === "env" ? <div className="note">из переменных окружения</div> : null}</> : <span className="note">не задан</span>}</td>
                    <td style={{ minWidth: 260 }}>
                      <div className="actions">
                        <input type="password" aria-label={"Ключ " + p.name} placeholder={p.keyHint} value={draftKeys[p.id] || ""} onChange={e => setDraftKeys(d => ({ ...d, [p.id]: e.target.value }))} style={{ flex: 1, minWidth: 140 }} />
                        <button className="btn small" type="button" disabled={!draftKeys[p.id]} onClick={() => saveKey(p.id, draftKeys[p.id])}>Сохранить</button>
                        {keys[p.id]?.set ? <button className="btn small danger" type="button" onClick={() => saveKey(p.id, "")}>Удалить</button> : null}
                      </div>
                    </td>
                    <td style={{ minWidth: 200 }}>
                      {keys[p.id]?.set ? <button className="btn ghost small" type="button" onClick={() => testKey(p.id)} disabled={c === "busy"}>{c === "busy" ? "Проверяю…" : "Проверить"}</button> : null}
                      {c && c !== "busy" ? <div className={c.ok ? "note" : "note"} style={{ color: c.ok ? "var(--ok)" : "var(--bad)", marginTop: 4 }}>{c.msg}</div> : null}
                    </td>
                  </tr>
                );
              };

  return (
    <main className="wrap">
      <div className="pagehead">
        <div>
          <h1>Настройки и API-ключи</h1>
          <p className="sub">На своём компьютере ключи хранятся в файле <code>data/settings.local.json</code>, в GitHub он не попадает. Список моделей хранится в <code>data/models.json</code> и попадает в GitHub, чтобы сайт на Vercel использовал те же модели.</p>
        </div>
      </div>
      {server ? (
        <div className="warnbox" style={{ marginBottom: 16 }}>
          Это сайт на сервере (Vercel): здесь ничего нельзя сохранить. Ключи задаются в Vercel → Project → Settings → Environment Variables
          (ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY), модели — через файл data/models.json в GitHub.
          Кнопка «Проверить» работает.
        </div>
      ) : null}

      <div className="panel">
        <h2>1. Ключ Claude (Anthropic)</h2>
        <p className="note" style={{ marginTop: -6 }}>Продукт работает на Claude. Ключ создаётся на console.anthropic.com; там же пополняется баланс и ставится лимит расходов.</p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Провайдер</th><th>Ключ</th><th>Новый ключ</th><th>Проверка</th></tr></thead>
            <tbody>
              {providers.filter(p => p.id === "anthropic").map(keyRow)}
            </tbody>
          </table>
        </div>
        <details style={{ marginTop: 14 }}>
          <summary className="note">Другие провайдеры — для сравнения моделей, сейчас не нужны</summary>
          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Провайдер</th><th>Ключ</th><th>Новый ключ</th><th>Проверка</th></tr></thead>
              <tbody>{providers.filter(p => p.id !== "anthropic").map(keyRow)}</tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="panel">
        <h2>2. Модель продукта</h2>
        <p className="note" style={{ marginTop: -6 }}>Нажмите «+ Anthropic», выберите модель Claude из списка (появится после «Проверить» ключа) и укажите цену из прайса Anthropic — в долларах за 1 млн токенов, по ней считается стоимость разбора. «Демо-заглушка» работает без ключа, для проверки интерфейса.</p>
        <div className="actions" style={{ marginBottom: 12 }}>
          {allProviders.map(p => <button key={p.id} type="button" className="btn ghost small" onClick={() => addModel(p.id)}>+ {p.name.split(" (")[0]}</button>)}
        </div>
        {models.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Вкл.</th><th>Провайдер</th><th>Модель</th><th>Название в таблицах</th><th className="num">$ / 1M вход</th><th className="num">$ / 1M выход</th><th></th></tr></thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.id}>
                    <td><input type="checkbox" aria-label="Включена" checked={m.enabled} onChange={e => setModel(m.id, { enabled: e.target.checked })} /></td>
                    <td className="note">{allProviders.find(p => p.id === m.provider)?.name.split(" (")[0]}{!keys[m.provider]?.set ? <div style={{ color: "var(--bad)" }}>нет ключа</div> : null}</td>
                    <td style={{ minWidth: 220 }}>
                      <input type="text" className="mono" list={"list-" + m.provider} placeholder="выберите или впишите id" value={m.model} onChange={e => setModel(m.id, { model: e.target.value })} aria-label="Модель" />
                    </td>
                    <td style={{ minWidth: 160 }}><input type="text" value={m.label} placeholder={m.model || "например, Claude основной"} onChange={e => setModel(m.id, { label: e.target.value })} aria-label="Название" /></td>
                    <td className="num" style={{ width: 110 }}><input type="number" step="0.01" min="0" value={m.priceIn} onChange={e => setModel(m.id, { priceIn: Number(e.target.value) })} aria-label="Цена вход" /></td>
                    <td className="num" style={{ width: 110 }}><input type="number" step="0.01" min="0" value={m.priceOut} onChange={e => setModel(m.id, { priceOut: Number(e.target.value) })} aria-label="Цена выход" /></td>
                    <td><button type="button" className="btn small danger" onClick={() => setModels(ms => ms.filter(x => x.id !== m.id))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">Моделей пока нет. Нажмите «+ провайдер» выше.</p>}
        {providers.map(p => (
          <datalist id={"list-" + p.id} key={p.id}>{(available[p.id] || []).map(x => <option key={x.id} value={x.id} />)}</datalist>
        ))}
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn" type="button" onClick={saveModels}>Сохранить модели</button>
          <span className="note">{msg}</span>
        </div>
      </div>
    </main>
  );
}
