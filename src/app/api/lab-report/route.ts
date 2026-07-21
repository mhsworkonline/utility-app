import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getAiSettings, logError } from "@/lib/settings";
import { chat, extractJson } from "@/lib/providers";

// Groq decommissioned meta-llama/llama-4-scout-17b-16e-instruct.
// Override without a code change via the GROQ_MODEL env var.
const DEFAULT_MODEL = "qwen/qwen3.6-27b";

interface Config {
  groq_api_key: string;
  model?: string;
}

function loadConfig(): Config {
  const envKey = process.env.GROQ_API_KEY?.trim();
  if (envKey) return { groq_api_key: envKey };
  try {
    const cfgPath = path.join(process.cwd(), "servers", "xray-identifier", "config.json");
    return JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Config;
  } catch {
    throw new Error("GROQ_API_KEY is not configured. Add it in Netlify → Site Settings → Environment Variables, then redeploy.");
  }
}

const RULES = `
RULES:
1. Extract ALL tests visible in the report — numeric and qualitative.
2. For QUALITATIVE tests (PCR, culture, antigen, antibody, serology):
   - value = the reported result (e.g. "Detected", "Not Detected", "Positive", "Negative", "Reactive")
   - reference_range = the expected normal result (e.g. "Not Detected", "Negative", "Non-Reactive")
   - status = HIGH if result indicates presence of pathogen/disease (Detected, Positive, Reactive, Present); NORMAL if absent (Not Detected, Negative, Non-Reactive)
   - unit = "" (empty string)
3. For NUMERIC tests: status = HIGH if above range, LOW if below range, NORMAL if within range.
4. summary MUST be 2–4 sentences. Never leave it empty. Describe key findings and their clinical significance.
5. recommendations MUST be a non-empty paragraph. Always give actionable next steps.
6. flags = list every abnormal result as an object with finding, significance (what it may indicate clinically — organs, conditions, systems affected), and action (specific next step). Empty array only if everything is normal.
7. Use "Not specified" for missing patient fields.
8. Be economical: no whitespace padding, no repeated text, keep "note" short or empty.`;

const BASE_SCHEMA = `{
  "patient": { "name": "string", "age": "string", "gender": "string", "date": "string", "lab_name": "string" },
  "report_type": "CBC / LFT / KFT / Lipid Panel / Thyroid / Blood Sugar / Urine / PCR / Serology / Other",
  "tests": [
    {
      "name": "Test name",
      "value": "result as string (numeric or qualitative)",
      "unit": "unit or empty string",
      "reference_range": "expected normal result or range",
      "status": "NORMAL or HIGH or LOW",
      "note": "brief clinical note or empty string"
    }
  ],
  "summary": "2–4 sentence plain-language summary — REQUIRED, never empty",
  "flags": [
    {
      "finding": "short statement of the abnormal result e.g. RDW-CV is high at 14.6%",
      "significance": "2–3 sentences on what this may indicate clinically — which conditions, organs, or systems it could affect",
      "action": "specific recommended next step e.g. test to order, specialist to see, lifestyle change"
    }
  ],
  "recommendations": "concise overall recommendations paragraph — REQUIRED, never empty"
}`;

const IMAGE_PROMPT = `You are a medical lab report analyzer. Analyze this lab report image thoroughly.
Return ONLY a valid JSON object (no markdown, no extra text):
${BASE_SCHEMA}
${RULES}`;

const TEXT_PROMPT = `You are a medical lab report analyzer. Analyze the following lab report text.
Return ONLY a valid JSON object (no markdown, no extra text):
${BASE_SCHEMA}
${RULES}

Lab report text:
`;

export async function POST(req: NextRequest) {
  let body: { type?: string; data?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const { type, data } = body;
  if (!type || !data)
    return NextResponse.json({ error: "Missing type or data." }, { status: 400 });

  // Admin panel (Supabase) is the source of truth; env/config.json are fallbacks.
  const ai = await getAiSettings();
  const cfg = ai.lab_report;
  let apiKey = ai.keys[cfg.provider];
  if (!apiKey && cfg.provider === "groq") {
    try { apiKey = loadConfig().groq_api_key; } catch { /* handled below */ }
  }
  if (!apiKey) {
    const msg = `No API key configured for ${cfg.provider}. Set it in /admin.`;
    await logError("lab-report", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const model = cfg.model || DEFAULT_MODEL;
  const basePrompt = type === "image" ? IMAGE_PROMPT : TEXT_PROMPT + data;
  const image = type === "image" ? { base64: data, mime: "image/jpeg" } : undefined;

  // Dense reports can exceed the output budget. If the first attempt is cut off
  // mid-JSON, retry once asking for a terser report rather than failing.
  const TERSE = `\nIMPORTANT: keep the response compact — summary max 2 sentences, each significance max 1 sentence, "note" empty. The JSON must be complete and valid.`;

  const attempt = (prompt: string) =>
    chat({
      provider: cfg.provider,
      apiKey,
      model,
      prompt,
      image,
      maxTokens: cfg.max_tokens,
      temperature: cfg.temperature,
      // Reasoning models otherwise spend the whole budget on <think> output.
      reasoningEffort: cfg.reasoning_effort,
    });

  let result;
  try {
    result = await attempt(basePrompt);
    if (result.truncated && !extractJson(result.text)) {
      result = await attempt(basePrompt + TERSE);
    }
  } catch (err) {
    const msg = (err as Error).message;
    await logError("lab-report", `[${cfg.provider}/${model}] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const parsed = extractJson(result.text);
  if (!parsed) {
    const msg = result.truncated
      ? `The report was too long for this model's output limit (${model}, ${cfg.max_tokens} tokens). Increase the limit or switch to a larger model in /admin.`
      : `Could not parse the AI response as JSON (model: ${model}).`;
    await logError("lab-report", `${msg} Raw: ${result.text.slice(0, 300)}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json(normalizeReport(parsed));
}

/** Models return statuses like "Low"/"Positive"; the UI only styles NORMAL/HIGH/LOW. */
function normalizeStatus(status: unknown, value: unknown): "NORMAL" | "HIGH" | "LOW" {
  const s = String(status ?? "").toUpperCase().trim();
  if (s === "HIGH" || s === "LOW" || s === "NORMAL") return s;
  const both = `${s} ${String(value ?? "").toUpperCase()}`;
  if (/NOT\s*DETECTED|NON.?REACTIVE|NEGATIVE|ABSENT/.test(both)) return "NORMAL";
  if (/DETECTED|REACTIVE|POSITIVE|PRESENT|ABNORMAL|ELEVATED|ABOVE/.test(both)) return "HIGH";
  if (/BELOW|DECREASED|DEFICIENT/.test(both)) return "LOW";
  return "NORMAL";
}

function normalizeReport(report: unknown) {
  const r = report as { tests?: { status?: unknown; value?: unknown }[] };
  if (Array.isArray(r?.tests))
    for (const t of r.tests) t.status = normalizeStatus(t.status, t.value);
  return r;
}
