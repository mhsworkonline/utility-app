import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

interface Config {
  groq_api_key: string;
  model?: string;
}

function loadConfig(): Config {
  const cfgPath = path.join(process.cwd(), "servers", "xray-identifier", "config.json");
  return JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Config;
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
7. Use "Not specified" for missing patient fields.`;

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

  let config: Config;
  try { config = loadConfig(); }
  catch { return NextResponse.json({ error: "Server config not found." }, { status: 500 }); }

  const model = config.model ?? "meta-llama/llama-4-scout-17b-16e-instruct";
  const messages = type === "image"
    ? [{ role: "user", content: [
        { type: "text", text: IMAGE_PROMPT },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data}` } }
      ]}]
    : [{ role: "user", content: TEXT_PROMPT + data }];

  let groqRes: Response;
  try {
    groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.groq_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.1 }),
    });
  } catch (err) {
    return NextResponse.json({ error: `Groq request failed: ${(err as Error).message}` }, { status: 502 });
  }

  const groqData = await groqRes.json() as {
    choices?: { message: { content: string } }[];
    error?: { message: string };
  };
  if (!groqRes.ok)
    return NextResponse.json({ error: groqData.error?.message ?? `Groq HTTP ${groqRes.status}` }, { status: 502 });

  let content = groqData.choices?.[0]?.message?.content?.trim() ?? "";
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return NextResponse.json(JSON.parse(content));
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return NextResponse.json(JSON.parse(match[0]));
    return NextResponse.json({ error: "Could not parse AI response as JSON." }, { status: 502 });
  }
}
