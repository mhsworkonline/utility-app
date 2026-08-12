import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/settings";

// Local faster-whisper service — see python-services/whisper-transcriber. Free,
// runs on your own machine; point WHISPER_SERVICE_URL elsewhere if you host it
// on a VPS instead.
const SERVICE_URL = (process.env.WHISPER_SERVICE_URL || "http://127.0.0.1:8008").replace(/\/$/, "");
const NOT_RUNNING_MSG =
  `Local transcription service isn't reachable at ${SERVICE_URL}. ` +
  "Start it: `python server.py` in python-services/whisper-transcriber (see its README).";

/**
 * Proxies a short audio chunk (captured tab/window/video audio from
 * live-transcriber.html) to the local Whisper service.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0)
    return NextResponse.json({ error: "Missing audio chunk." }, { status: 400 });

  const language = form.get("language");

  const upstream = new FormData();
  upstream.append("audio", audio, "chunk.webm");
  if (typeof language === "string" && language.trim()) upstream.append("language", language.trim());

  try {
    const r = await fetch(`${SERVICE_URL}/transcribe`, { method: "POST", body: upstream });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`);
    return NextResponse.json({ text: String(d.text ?? "").trim() });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } })?.cause;
    const connRefused = cause?.code === "ECONNREFUSED" || /ECONNREFUSED|fetch failed/i.test((err as Error).message);
    const msg = connRefused ? NOT_RUNNING_MSG : (err as Error).message;
    await logError("live-transcriber", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
