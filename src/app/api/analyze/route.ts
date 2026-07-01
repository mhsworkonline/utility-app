import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

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

  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const payload = {
    model: config.model ?? "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
        ],
      },
    ],
    max_tokens: 2500,
    temperature: 0.1,
  };

  let groqRes: Response;
  try {
    groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.groq_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return NextResponse.json({ error: `Groq request failed: ${(err as Error).message}` }, { status: 502 });
  }

  const groqData = await groqRes.json() as {
    choices?: { message: { content: string } }[];
    error?: { message: string };
  };

  if (!groqRes.ok) {
    return NextResponse.json({ error: groqData.error?.message ?? `Groq HTTP ${groqRes.status}` }, { status: 502 });
  }

  let content = groqData.choices?.[0]?.message?.content?.trim() ?? "";
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const analysis = JSON.parse(content);
    return NextResponse.json(analysis);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return NextResponse.json(JSON.parse(match[0]));
    return NextResponse.json({ error: "Could not parse Groq response as JSON." }, { status: 502 });
  }
}
