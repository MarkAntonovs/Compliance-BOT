import { promises as fs } from "fs";
import path from "path";
import type { ProviderId, Settings } from "./types";

// Local file with API keys. Listed in .gitignore — never commit it.
const FILE = path.join(process.cwd(), "data", "settings.local.json");

export const PROVIDERS: { id: ProviderId; name: string; keyUrl: string; keyHint: string }[] = [
  { id: "anthropic", name: "Anthropic (Claude)", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-…" },
  { id: "openai", name: "OpenAI (ChatGPT)", keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-…" },
  { id: "xai", name: "xAI (Grok)", keyUrl: "https://console.x.ai", keyHint: "xai-…" },
  { id: "gemini", name: "Google (Gemini)", keyUrl: "https://aistudio.google.com/apikey", keyHint: "AIza…" },
  { id: "openrouter", name: "OpenRouter (сотни моделей по одному ключу)", keyUrl: "https://openrouter.ai/keys", keyHint: "sk-or-…" },
];

// "Демо" — fake model without a key, to check the interface and the Lab before buying API access.
export const DEMO_PROVIDER = { id: "demo" as ProviderId, name: "Демо (без ключа, ответ-заглушка)", keyUrl: "", keyHint: "" };

const DEFAULT: Settings = { keys: {}, models: [{ id: "m_demo", provider: "demo", model: "demo", label: "Демо-заглушка", priceIn: 0, priceOut: 0, enabled: true }] };

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const s = JSON.parse(raw) as Settings;
    return { keys: s.keys || {}, models: Array.isArray(s.models) ? s.models : DEFAULT.models };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export async function writeSettings(s: Settings): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(s, null, 2), "utf8");
}

export function maskKey(k?: string): string {
  if (!k) return "";
  if (k.length <= 10) return "••••";
  return k.slice(0, 6) + "…" + k.slice(-4);
}
