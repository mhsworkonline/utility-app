import { NextRequest, NextResponse } from "next/server";
import { getAiSettings, logError } from "@/lib/settings";
import { chat, extractJson } from "@/lib/providers";
import path from "path";
import fs from "fs";

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

const PROMPT = `You are an expert radiologist. Analyze this medical image thoroughly.

First identify the imaging modality:
- X-Ray: 2D projection, grayscale, bones appear bright white
- CT Scan: cross-sectional slices, Hounsfield density values visible, axial/coronal/sagittal views, higher soft tissue detail
- MRI: soft tissue contrast with T1/T2 weighted sequences, no bone brightness, signal intensity variations, excellent soft tissue differentiation

Return ONLY a valid JSON object (no markdown code fences, no extra text) with this exact structure:
{
  "scan_type": "xray-chest / xray-spine / xray-dental / xray-limb / xray-pelvis / xray-skull / xray-abdomen / ct-chest / ct-abdomen / ct-brain / ct-spine / ct-pelvis / mri-brain / mri-spine / mri-knee / mri-abdomen / mri-pelvis / other",
  "modality": "X-Ray / CT Scan / MRI",
  "overall_assessment": "2-3 sentence clinical summary",
  "overall_severity": "normal / moderate / high",
  "findings": [
    {
      "id": 1,
      "region": "anatomical region name",
      "finding": "detailed clinical description — for CT mention density/Hounsfield values if relevant; for MRI mention signal intensity (T1/T2 hyperintense/hypointense); for X-Ray mention opacity, lucency, density",
      "severity": "normal / moderate / high",
      "zone": "one of: top-left, top-right, top-center, center-left, center, center-right, bottom-left, bottom-center, bottom-right, full"
    }
  ],
  "recommendations": "clinical recommendations or next steps"
}

Include all visible structures — normal findings, abnormalities, and modality-specific observations. Be specific and thorough. The zone field should reflect WHERE in the image the finding is located.`;

export async function POST(req: NextRequest) {
  let body: { image_base64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { image_base64 } = body;
  if (!image_base64) {
    return NextResponse.json({ error: "Missing image_base64 in request body." }, { status: 400 });
  }

  // Admin panel (Supabase) is the source of truth; env/config.json are fallbacks.
  const ai = await getAiSettings();
  const cfg = ai.analyze;
  let apiKey = ai.keys[cfg.provider];
  if (!apiKey && cfg.provider === "groq") {
    try { apiKey = loadConfig().groq_api_key; } catch { /* handled below */ }
  }
  if (!apiKey) {
    const msg = `No API key configured for ${cfg.provider}. Set it in /admin.`;
    await logError("analyze", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const model = cfg.model || DEFAULT_MODEL;
  let result;
  try {
    result = await chat({
      provider: cfg.provider,
      apiKey,
      model,
      prompt: PROMPT,
      image: { base64: image_base64, mime: "image/jpeg" },
      maxTokens: cfg.max_tokens,
      temperature: cfg.temperature,
      // Reasoning models otherwise burn the token budget on <think> output.
      reasoningEffort: cfg.reasoning_effort,
    });
  } catch (err) {
    const msg = (err as Error).message;
    await logError("analyze", `[${cfg.provider}/${model}] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const analysis = extractJson(result.text);
  if (!analysis) {
    const msg = result.truncated
      ? `The model ran out of output tokens before finishing (model: ${model}). Pick a model with a larger output limit in /admin.`
      : `Could not parse the AI response as JSON (model: ${model}).`;
    await logError("analyze", `${msg} Raw: ${result.text.slice(0, 300)}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  return NextResponse.json(analysis);
}
