import { sbSelect, sbUpsert, sbInsert, supabaseConfigured } from "./supabase";
import { PROVIDERS, isProvider, type ProviderId } from "./providers";

export interface AppModelCfg {
  provider: ProviderId;
  model: string;
  max_tokens: number;
  temperature: number;
  reasoning_effort: string;
}

export type ProviderKeys = Record<ProviderId, string>;

export interface AiSettings {
  keys: ProviderKeys;
  analyze: AppModelCfg;
  lab_report: AppModelCfg;
}

export const EMPTY_KEYS: ProviderKeys = { groq: "", openai: "", anthropic: "", gemini: "" };

/** Last-resort defaults if the DB is unreachable and no env vars are set. */
export const DEFAULT_AI: AiSettings = {
  keys: { ...EMPTY_KEYS },
  analyze: { provider: "groq", model: "qwen/qwen3.6-27b", max_tokens: 2500, temperature: 0.1, reasoning_effort: "none" },
  // Groq counts prompt + max_tokens against the per-minute cap before running.
  // With qwen the image bills ~1.8k and the schema/rules ~1.5k, so on the 8k
  // tier only ~4.6k of output fits. A dense 30-test report measured 2.3k, so
  // 3500 leaves headroom without tripping the ceiling.
  lab_report: { provider: "groq", model: "qwen/qwen3.6-27b", max_tokens: 3500, temperature: 0.1, reasoning_effort: "none" },
};

let cache: { data: AiSettings; at: number } | null = null;
const TTL_MS = 60_000;

export function clearSettingsCache() {
  cache = null;
}

/** Accepts both the current shape and the earlier single-provider shape. */
function normalize(raw: Record<string, unknown>): AiSettings {
  const legacyKey = typeof raw.groq_api_key === "string" ? raw.groq_api_key : "";
  const rawKeys = (raw.keys ?? {}) as Partial<ProviderKeys>;

  const keys: ProviderKeys = { ...EMPTY_KEYS };
  for (const p of PROVIDERS) {
    const fromDb = typeof rawKeys[p.id] === "string" ? rawKeys[p.id]!.trim() : "";
    const fromEnv = process.env[p.keyEnv]?.trim() ?? "";
    keys[p.id] = fromDb || (p.id === "groq" ? legacyKey.trim() : "") || fromEnv;
  }

  const cfg = (key: "analyze" | "lab_report"): AppModelCfg => {
    const d = DEFAULT_AI[key];
    const v = (raw[key] ?? {}) as Partial<AppModelCfg>;
    return {
      provider: isProvider(v.provider) ? v.provider : d.provider,
      model: (typeof v.model === "string" && v.model.trim()) || process.env.GROQ_MODEL?.trim() || d.model,
      max_tokens: Number(v.max_tokens) || d.max_tokens,
      temperature: Number.isFinite(Number(v.temperature)) ? Number(v.temperature) : d.temperature,
      reasoning_effort: (typeof v.reasoning_effort === "string" && v.reasoning_effort) || d.reasoning_effort,
    };
  };

  return { keys, analyze: cfg("analyze"), lab_report: cfg("lab_report") };
}

/** Resolution order: DB (admin panel) -> env var -> code default. */
export async function getAiSettings(): Promise<AiSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  let raw: Record<string, unknown> = {};
  if (supabaseConfigured) {
    try {
      const rows = await sbSelect<{ value: Record<string, unknown> }>("ua_settings", "key=eq.ai&select=value");
      raw = rows[0]?.value ?? {};
    } catch {
      /* fall through to env/defaults */
    }
  }

  const data = normalize(raw);
  cache = { data, at: Date.now() };
  return data;
}

export async function saveAiSettings(next: AiSettings): Promise<void> {
  await sbUpsert("ua_settings", [{ key: "ai", value: next, updated_at: new Date().toISOString() }], "key");
  clearSettingsCache();
}

/** Fire-and-forget error logging; never throws into the request path. */
export async function logError(app: string, message: string): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    await sbInsert("ua_error_log", [{ app, message: message.slice(0, 1000) }]);
  } catch {
    /* logging must never break the caller */
  }
}
