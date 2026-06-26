import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { YT_DLP_BIN } from "@/lib/ytdlp";

const FORMAT_MAP: Record<string, string> = {
  "360":  "bestvideo[height<=360]+bestaudio/best[height<=360]",
  "480":  "bestvideo[height<=480]+bestaudio/best[height<=480]",
  "720":  "bestvideo[height<=720]+bestaudio/best[height<=720]",
  "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
};

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(stderr || `yt-dlp exited with code ${code}`), { stderr }));
    });
    proc.on("error", reject);
  });
}

function isNotFound(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { stderr?: string };
  if (e.code === "ENOENT") return true;
  const msg = e.stderr ?? e.message ?? "";
  return msg.includes("ENOENT") || msg.includes("not found") || msg.includes("is not recognized");
}

// POST — runs yt-dlp, saves to temp, returns a key for /api/video-serve
export async function POST(req: NextRequest) {
  let body: { url?: string; format?: string; title?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { url, format = "720", title = "video" } = body;
  try { const p = new URL(url ?? ""); if (!["http:", "https:"].includes(p.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: "Invalid URL." }, { status: 400 }); }

  const isMp3 = format === "mp3";
  const ext = isMp3 ? "mp3" : "mp4";
  const key = randomUUID();
  const tempPath = join(tmpdir(), `yt_${key}.${ext}`);

  const args: string[] = [];
  if (isMp3) {
    args.push("-f", "bestaudio/best", "--extract-audio", "--audio-format", "mp3");
  } else {
    args.push("-f", FORMAT_MAP[format] ?? FORMAT_MAP["720"], "--merge-output-format", "mp4");
  }
  args.push("--max-filesize", "100m", "--no-playlist", "-o", tempPath, url!);

  try {
    await runYtDlp(args);
    // Brief settle — ensures Windows flushes file handles before we check existence
    await new Promise(r => setTimeout(r, 300));
  } catch (err) {
    if (isNotFound(err))
      return NextResponse.json({ error: "yt-dlp not found. Run: node setup-deps.js" }, { status: 500 });
    const msg = ((err as Error & { stderr?: string }).stderr ?? (err as Error).message ?? "").toLowerCase();
    if (msg.includes("ffmpeg") || msg.includes("postprocessor"))
      return NextResponse.json({ error: "ffmpeg is required for this format." }, { status: 500 });
    if (msg.includes("too large") || msg.includes("filesize"))
      return NextResponse.json({ error: "Video exceeds the 100 MB size limit." }, { status: 400 });
    return NextResponse.json({ error: "Download failed. The video may be unavailable or restricted." }, { status: 500 });
  }

  // Scan tmpdir for the actual file (yt-dlp may adjust the extension slightly)
  const tmp = tmpdir();
  const prefix = `yt_${key}`;
  let actualPath: string | null = null;
  try {
    const match = readdirSync(tmp).find(f => f.startsWith(prefix));
    if (match) actualPath = join(tmp, match);
  } catch {}

  if (!actualPath) {
    return NextResponse.json({ error: "Video exceeds 100 MB or could not be downloaded." }, { status: 400 });
  }

  const actualExt = (actualPath.split(".").pop() ?? ext).toLowerCase();

  let safeTitle = (title ?? "video").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  if (safeTitle.length > 60) safeTitle = safeTitle.slice(0, 60).replace(/\s+\S*$/, "").trim();
  safeTitle = safeTitle.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "video";
  return NextResponse.json({ key, ext: actualExt, filename: `${safeTitle}.${actualExt}` });
}
