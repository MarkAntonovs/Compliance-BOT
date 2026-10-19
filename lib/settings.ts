import { promises as fs } from "fs";
import path from "path";
import type { ModelEntry, ProviderId, Settings } from "./types";

// Where things live:
// - API keys: on your computer in data/settings.local.json (NOT in Git);
//   on Vercel in Environment Variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, …). Env wins.
// - Model list: data/models.json — no secrets, goes to Git, so Vercel uses the same models.
const KEYS_FILE = path.join(process.cwd(), "data", "settings.local.json");
const MODELS_FILE = path.join(process.cwd(), "data", "models.json");

export const PROVIDERS: { id: ProviderId; name: string; keyUrl: string; keyHint: string; env: string }[] = [
  { id: "anthropic", name: "Anthropic (Claude)", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-…", env: "ANTHROPIC_API_KEY" },
  { id: "openai", name: "OpenAI (ChatGPT)", keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-…", env: "OPENAI_API_KEY" },
  { id: "xai", name: "xAI (Grok)", keyUrl: "https://console.x.ai", keyHint: "xai-…", env: "XAI_API_KEY" },
  { id: "gemini", name: "Google (Gemini)", keyUrl: "https://aistudio.google.com/apikey", keyHint: "AIza…", env: "GEMINI_API_KEY" },
  { id: "openrouter", name: "OpenRouter (сотни моделей по одному ключу)", keyUrl: "https://openrouter.ai/keys", keyHint: "sk-or-…", env: "OPENROUTER_API_KEY" },
];

// "Демо" — fake model without a key, to check the interface and the Lab before buying API access.
export const DEMO_PROVIDER = { id: "demo" as ProviderId, name: "Демо (без ключа, ответ-заглушка)", keyUrl: "", keyHint: "", env: "" };

const DEMO_MODEL: ModelEntry = { id: "m_demo", provider: "demo", model: "demo", label: "Демо-заглушка", priceIn: 0, priceOut: 0, enabled: true };

/** True on Vercel (or any server where DEPLOYED=1): files there cannot be saved. */
export const onServer = () => !!process.env.VERCEL || process.env.DEPLOYED === "1";

async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch { return null; }
}

export async function readSettings(): Promise<Settings & { keySource: Partial<Record<ProviderId, "env" | "file">> }> {
  const local = (await readJson<{ keys?: Settings["keys"]; models?: ModelEntry[] }>(KEYS_FILE)) || {};
  const keys: Settings["keys"] = { ...(local.keys || {}) };
  const keySource: Partial<Record<ProviderId, "env" | "file">> = {};
  for (const p of PROVIDERS) {
    if (keys[p.id]) keySource[p.id] = "file";
    const v = process.env[p.env];
    if (v) { keys[p.id] = v.trim(); keySource[p.id] = "env"; }
  }
  // Older versions kept models inside settings.local.json — still read them if models.json is missing.
  const models = (await readJson<ModelEntry[]>(MODELS_FILE)) || local.models || [DEMO_MODEL];
  return { keys, models: Array.isArray(models) ? models : [DEMO_MODEL], keySource };
}

export async function writeKeys(keys: Settings["keys"]): Promise<void> {
  if (onServer()) throw new Error("На сервере ключи задаются в Vercel → Settings → Environment Variables.");
  const local = (await readJson<Record<string, unknown>>(KEYS_FILE)) || {};
  await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });
  await fs.writeFile(KEYS_FILE, JSON.stringify({ ...local, keys }, null, 2), "utf8");
}

export async function writeModels(models: ModelEntry[]): Promise<void> {
  if (onServer()) throw new Error("На сервере список моделей меняется через файл data/models.json в GitHub.");
  await fs.writeFile(MODELS_FILE, JSON.stringify(models, null, 2) + "\n", "utf8");
}

export function maskKey(k?: string): string {
  if (!k) return "";
  if (k.length <= 10) return "••••";
  return k.slice(0, 6) + "…" + k.slice(-4);
}
