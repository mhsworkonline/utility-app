import { NextRequest, NextResponse } from "next/server";
import { getAiSettings } from "@/lib/settings";
import { chat, isProvider } from "@/lib/providers";

// 16x16 checkerboard PNG — providers reject images smaller than 2px per side.
const PROBE_IMG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJklEQVR4nGOQRAKvkQAucYZBqIEYRcjig1HDIAxWkjUMwmAlVQMAVguGEMXrepoAAAAASUVORK5CYII=";

/** Verifies a model exists, responds, and accepts image input, before it is relied on. */
export async function POST(req: NextRequest) {
  let body: { provider?: string; model?: string; reasoning_effort?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { provider, model } = body;
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  if (!model?.trim()) return NextResponse.json({ error: "No model specified." }, { status: 400 });

  const { keys } = await getAiSettings();
  const apiKey = keys[provider];
  if (!apiKey) return NextResponse.json({ error: `No API key saved for ${provider}.` }, { status: 400 });

  const base = {
    provider,
    apiKey,
    model: model.trim(),
    maxTokens: 64,
    temperature: 0,
    reasoningEffort: body.reasoning_effort,
  };

  try {
    const started = Date.now();
    await chat({ ...base, prompt: "Reply with the single word: OK" });
    const latency = Date.now() - started;

    let vision = true;
    let visionError: string | null = null;
    try {
      await chat({
        ...base,
        prompt: "Describe this image in three words.",
        image: { base64: PROBE_IMG, mime: "image/png" },
      });
    } catch (err) {
      vision = false;
      visionError = (err as Error).message.slice(0, 160);
    }

    return NextResponse.json({ ok: true, latency_ms: latency, vision, vision_error: visionError });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message.slice(0, 200) });
  }
}
