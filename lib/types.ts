export type ProviderId = "anthropic" | "openai" | "xai" | "gemini" | "openrouter" | "demo";

export type ModelEntry = {
  id: string;            // local id, e.g. "m_ab12"
  provider: ProviderId;
  model: string;         // provider model id, e.g. "gpt-5-mini"
  label: string;         // name shown in tables
  priceIn: number;       // USD per 1M input tokens
  priceOut: number;      // USD per 1M output tokens
  enabled: boolean;
};

export type Settings = {
  keys: Partial<Record<ProviderId, string>>;
  models: ModelEntry[];
};

export type ClientType = "individual" | "company" | "sole_trader";
export type Lang = "en" | "ru" | "lv";

export type AnalyzeInput = {
  modelId: string;
  request: string;
  context?: string;
  clientType: ClientType;
  replyLang: "same" | Lang;
  uiLang: Lang;
};

export type RequestedItem = {
  item: string;
  why_requested: string;
  possible_evidence: string[];
  what_to_clarify?: string;
  status: "have" | "missing" | "unclear";
};

export type Analysis = {
  detected_language?: string;
  request_types?: string[];
  deadline?: string | null;
  plain_language_summary: string;
  requested_items: RequestedItem[];
  questions_for_user?: string[];
  draft_reply: string;
  check_before_sending?: string[];
  uncertainties?: string[];
  safety_note?: string | null;
};

export type AnalyzeResult = {
  ok: boolean;
  data?: Analysis;
  raw?: string;
  error?: string;
  modelId: string;
  label: string;
  provider: ProviderId;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  promptVersion?: string;
};

export type TestCase = {
  id: string;
  src: "forum" | "syn";
  title: string;
  category?: string;
  client_type: ClientType;
  lang?: Lang;
  bank_request_text: string;
  user_context?: string;
  trap?: string;
  expect_safety?: boolean;
  expect_scam_warning?: boolean;
  [k: string]: unknown;
};

export type RubricItem = { id: string; label: string; hint?: string };

// One answer in a quality run + the reviewer's grading.
export type RunCell = AnalyzeResult & {
  caseId: string;
  score?: number | null;                 // 1–5 overall
  checks?: Record<string, boolean>;      // rubric id → passed / failed (absent = not graded)
  note?: string;
};

export type Run = {
  id: string;
  createdAt: string;
  name: string;
  promptVersion?: string;
  caseIds: string[];
  models: { id: string; label: string; provider: ProviderId; model: string }[];
  cells: RunCell[];
};
