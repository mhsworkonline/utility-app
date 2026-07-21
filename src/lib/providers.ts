/**
 * Multi-provider LLM abstraction.
 * Each provider has a different wire format for chat + vision + model listing;
 * everything above this file works in the normalized shapes declared here.
 */

export type ProviderId = "groq" | "openai" | "anthropic" | "gemini";

export const PROVIDERS: { id: ProviderId; label: string; keyEnv: string; keyHint: string }[] = [
  { id: "groq", label: "Groq", keyEnv: "GROQ_API_KEY", keyHint: "gsk_…" },
  { id: "openai", label: "OpenAI", keyEnv: "OPENAI_API_KEY", keyHint: "sk-…" },
  { id: "anthropic", label: "Anthropic", keyEnv: "ANTHROPIC_API_KEY", keyHint: "sk-ant-…" },
  { id: "gemini", label: "Google Gemini", keyEnv: "GEMINI_API_KEY", keyHint: "AIza…" },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);
export const isProvider = (v: unknown): v is ProviderId => PROVIDER_IDS.includes(v as ProviderId);

export interface ChatInput {
  provider: ProviderId;
  apiKey: string;
  model: string;
  prompt: string;
  /** Optional image for vision calls. */
  image?: { base64: string; mime: string };
  maxTokens: number;
  temperature: number;
  /** Groq-only knob; ignored elsewhere. */
  reasoningEffort?: string;
}

const ANTHROPIC_VERSION = "2023-06-01";

/* ------------------------- model listing ------------------------- */

export async function listModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  if (!apiKey) throw new Error("No API key saved for this provider.");

  if (provider === "gemini") {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? `HTTP ${r.status}`);
    return (d.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .sort();
  }

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? `HTTP ${r.status}`);
    return (d.data ?? []).map((m: { id: string }) => m.id).sort();
  }

  // Groq + OpenAI are OpenAI-compatible.
  const base = provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1";
  const r = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? `HTTP ${r.status}`);
  return (d.data ?? [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => !/whisper|tts|embedding|guard|orpheus|moderation|dall-e|image/i.test(id))
    .sort();
}

/* ------------------------- chat ------------------------- */

export interface ChatResult {
  text: string;
  /** True when the model hit the token ceiling — the reply is cut off mid-output. */
  truncated: boolean;
}

function dispatch(input: ChatInput): Promise<ChatResult> {
  switch (input.provider) {
    case "anthropic": return chatAnthropic(input);
    case "gemini": return chatGemini(input);
    default: return chatOpenAiCompatible(input);
  }
}

/**
 * Returns the assistant's text. Throws with the provider's message on failure.
 *
 * Providers count `prompt + max_tokens` against a per-minute ceiling *before*
 * running the request, so an output budget that's too generous is rejected
 * outright. Groq reports the exact numbers, so shrink the budget and retry once
 * instead of surfacing a dead end to the user.
 */
export async function chat(input: ChatInput): Promise<ChatResult> {
  try {
    return await dispatch(input);
  } catch (err) {
    const msg = (err as Error).message;
    const limit = Number(msg.match(/Limit (\d+)/)?.[1]);
    const requested = Number(msg.match(/Requested (\d+)/)?.[1]);
    if (!limit || !requested || requested <= limit) throw err;

    const overage = requested - limit;
    const retryMax = input.maxTokens - overage - 256; // margin for tokenizer drift
    if (retryMax < 512) {
      throw new Error(
        `The request is too large for ${input.model} (limit ${limit} tokens/min, needed ${requested}). Choose a model with a higher limit in /admin.`,
      );
    }
    return dispatch({ ...input, maxTokens: retryMax });
  }
}

async function chatOpenAiCompatible(i: ChatInput): Promise<ChatResult> {
  const base = i.provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1";
  const content = i.image
    ? [
        { type: "text", text: i.prompt },
        { type: "image_url", image_url: { url: `data:${i.image.mime};base64,${i.image.base64}` } },
      ]
    : i.prompt;

  const body: Record<string, unknown> = {
    model: i.model,
    messages: [{ role: "user", content }],
    temperature: i.temperature,
  };
  // OpenAI's newer models reject `max_tokens`.
  if (i.provider === "openai") body.max_completion_tokens = i.maxTokens;
  else body.max_tokens = i.maxTokens;
  // Groq uses none|default; other vocabularies would 400, so keep it Groq-only.
  if (i.provider === "groq" && i.reasoningEffort) body.reasoning_effort = i.reasoningEffort;

  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${i.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? `HTTP ${r.status}`);
  return {
    text: d.choices?.[0]?.message?.content ?? "",
    truncated: d.choices?.[0]?.finish_reason === "length",
  };
}

async function chatAnthropic(i: ChatInput): Promise<ChatResult> {
  const content: unknown[] = [{ type: "text", text: i.prompt }];
  if (i.image)
    content.push({
      type: "image",
      source: { type: "base64", media_type: i.image.mime, data: i.image.base64 },
    });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": i.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: i.model,
      max_tokens: i.maxTokens,
      temperature: i.temperature,
      messages: [{ role: "user", content }],
    }),
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? `HTTP ${r.status}`);
  return {
    text: (d.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join(""),
    truncated: d.stop_reason === "max_tokens",
  };
}

async function chatGemini(i: ChatInput): Promise<ChatResult> {
  const parts: unknown[] = [{ text: i.prompt }];
  if (i.image) parts.push({ inline_data: { mime_type: i.image.mime, data: i.image.base64 } });

  const model = i.model.replace(/^models\//, "");
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(i.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: i.maxTokens, temperature: i.temperature },
      }),
      cache: "no-store",
    },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? `HTTP ${r.status}`);
  return {
    text: (d.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join(""),
    truncated: d.candidates?.[0]?.finishReason === "MAX_TOKENS",
  };
}

/** Extracts the largest balanced {...} block — survives prose or fences around the JSON. */
export function extractJson(raw: string): unknown | null {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(s); } catch { /* keep digging */ }

  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}
