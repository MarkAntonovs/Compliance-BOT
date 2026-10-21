import type { ProviderId } from "./types";

// One place that knows how to talk to each AI provider. No SDKs — plain HTTPS.
// Four of the five speak the OpenAI "chat completions" format; Anthropic has its own.

const OPENAI_COMPAT: Record<Exclude<ProviderId, "anthropic" | "demo">, string> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

export type CallResult = { text: string; tokensIn: number; tokensOut: number; providerCostUsd?: number; truncated?: boolean };

const TIMEOUT_MS = 180_000;

// fetch with a readable error when the network itself fails (no internet, DNS, firewall, timeout).
async function net(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    if (err.name === "TimeoutError") throw new Error("Модель не ответила за 3 минуты (таймаут).");
    const why = String(err.cause?.code || err.cause?.message || err.message).replace(/\.$/, "");
    throw new Error(`Нет связи с ${new URL(url).host}: ${why}. Проверь интернет, VPN или файрвол.`);
  }
}
const MAX_OUT = 12000;

async function asError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message || j?.error?.type || j?.message || JSON.stringify(j).slice(0, 300);
  } catch {
    detail = (await res.text().catch(() => "")).slice(0, 300);
  }
  const hint = res.status === 401 || res.status === 403 ? " (проверь API-ключ)" : res.status === 404 ? " (проверь название модели)" : res.status === 429 ? " (лимит запросов или нет денег на балансе)" : "";
  return new Error(`HTTP ${res.status}${hint}: ${detail}`);
}

// Fake answer for the "demo" provider: turns each numbered/bulleted line of the request into an item.
async function demoAnswer(prompt: string): Promise<CallResult> {
  await new Promise(r => setTimeout(r, 400 + Math.random() * 700));
  let data: unknown;
  if (prompt.startsWith("TASK:GENERATE_CASE")) {
    const n = Math.floor(Math.random() * 900 + 100);
    data = { title: `ДЕМО-кейс ${n}: директор российской стройфирмы`, client_type: "individual", lang: "ru",
      facts: `ДЕМО. Клиент — гражданин Латвии, резидент Риги. С 2019 года является директором и владеет 60% ООО «Строй-${n}» (Россия, ОКВЭД 41.20 — строительство жилых и нежилых зданий). В банк поступил запрос: подтвердить роль клиента в ООО «Строй-${n}» и источник регулярных поступлений 4 000 EUR в месяц от этой компании.`,
      question: "Банк спрашивает про мою российскую фирму. Что ответить?", hidden_issues: ["ДЕМО: директорство гражданина ЕС в российской компании — ст. 5n", "ДЕМО: контроль над компанией со строительной деятельностью — ст. 8a"] };
  } else if (prompt.startsWith("TASK:DRAFT_RULE")) {
    data = { title: "ДЕМО-правило", body: "ДЕМО: здесь Claude сформулирует правило из поправки эксперта." };
  } else if (prompt.startsWith("TASK:ANALYSE_CASE")) {
    data = { summary: "Это демо-разбор без ИИ. Он нужен, чтобы проверить интерфейс. Подключите настоящую модель в Настройках.", risk_level: "medium",
      findings: [{ title: "ДЕМО: находка", explanation: "Здесь будет объяснение риска.", legal_basis: "Регламент 833/2014, ст. 5n", severity: "high" }],
      ownership: "ДЕМО: клиент → 60% ООО (Россия)", documents_needed: [{ document: "ДЕМО: выписка ЕГРЮЛ", why: "Подтвердить роль", where_to_get: "ФНС России" }],
      actions: ["ДЕМО: действие 1"], questions_for_client: ["ДЕМО: вопрос"], reply_to_bank: "", open_questions: [] };
  } else {
    const req = (prompt.split("<<<REQUEST")[1] || "").split("REQUEST>>>")[0];
    const lines = req.split("\n").map(l => l.trim()).filter(l => /^(\d+[.)]|[-—•a-z]\)|[-—•])\s*/i.test(l));
    const items = (lines.length ? lines : ["(в запросе нет пронумерованных пунктов)"]).map(l => ({
      item: l.replace(/^(\d+[.)]|[-—•a-z]\)|[-—•])\s*/i, "").slice(0, 140), why_requested: "ДЕМО: здесь будет объяснение от настоящей модели.",
      possible_evidence: ["ДЕМО: пример документа"], what_to_clarify: "", status: "unclear" }));
    data = { detected_language: "other", request_types: ["other"], deadline: null,
      plain_language_summary: "Это демо-ответ без ИИ. Подключите настоящую модель в Настройках.",
      requested_items: items, questions_for_user: [], draft_reply: "", check_before_sending: [], uncertainties: [], safety_note: null };
  }
  const text = JSON.stringify(data);
  return { text, tokensIn: Math.round(prompt.length / 4), tokensOut: Math.round(text.length / 4), providerCostUsd: 0 };
}

export async function callModel(provider: ProviderId, apiKey: string, model: string, prompt: string): Promise<CallResult> {
  if (provider === "demo") return demoAnswer(prompt);
  if (!apiKey) throw new Error("Нет API-ключа для этого провайдера. Добавь его в Настройках.");
  if (!model) throw new Error("Не указана модель.");

  if (provider === "anthropic") {
    const res = await net("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: MAX_OUT, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw await asError(res);
    const j = await res.json();
    const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    return { text, tokensIn: j.usage?.input_tokens ?? 0, tokensOut: j.usage?.output_tokens ?? 0, truncated: j.stop_reason === "max_tokens" };
  }

  const base = OPENAI_COMPAT[provider];
  const body: Record<string, unknown> = { model, messages: [{ role: "user", content: prompt }] };
  // OpenAI's newer models only accept max_completion_tokens; the others use max_tokens.
  if (provider === "openai") body.max_completion_tokens = MAX_OUT; else body.max_tokens = MAX_OUT;
  if (provider === "openrouter") body.usage = { include: true };
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  if (provider === "openrouter") { headers["X-Title"] = "Bank Request Decoder"; }

  const res = await net(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw await asError(res);
  const j = await res.json();
  const msg = j.choices?.[0]?.message;
  const text = typeof msg?.content === "string" ? msg.content : Array.isArray(msg?.content) ? msg.content.map((p: { text?: string }) => p.text || "").join("") : "";
  return {
    text,
    tokensIn: j.usage?.prompt_tokens ?? 0,
    tokensOut: j.usage?.completion_tokens ?? 0,
    providerCostUsd: typeof j.usage?.cost === "number" ? j.usage.cost : undefined,
    truncated: j.choices?.[0]?.finish_reason === "length",
  };
}

export type ModelInfo = { id: string; priceIn?: number; priceOut?: number };

export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelInfo[]> {
  if (provider === "demo") return [{ id: "demo", priceIn: 0, priceOut: 0 }];
  if (!apiKey) throw new Error("Сначала сохрани API-ключ.");
  let url: string; const headers: Record<string, string> = {};
  if (provider === "anthropic") { url = "https://api.anthropic.com/v1/models?limit=100"; headers["x-api-key"] = apiKey; headers["anthropic-version"] = "2023-06-01"; }
  else { url = `${OPENAI_COMPAT[provider]}/models`; headers.authorization = `Bearer ${apiKey}`; }
  const res = await net(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw await asError(res);
  const j = await res.json();
  const arr: { id: string; pricing?: { prompt?: string; completion?: string } }[] = j.data || j.models || [];
  return arr.map(m => {
    const id = String(m.id || "").replace(/^models\//, "");
    const info: ModelInfo = { id };
    if (m.pricing) { // OpenRouter gives USD per token
      const pi = Number(m.pricing.prompt), po = Number(m.pricing.completion);
      if (isFinite(pi)) info.priceIn = +(pi * 1e6).toFixed(4);
      if (isFinite(po)) info.priceOut = +(po * 1e6).toFixed(4);
    }
    return info;
  }).filter(m => m.id).sort((a, b) => a.id.localeCompare(b.id));
}
