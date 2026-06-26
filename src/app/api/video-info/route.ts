import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { YT_DLP_BIN } from "@/lib/ytdlp";

const execFileAsync = promisify(execFile);

interface YtFormat {
  format_id: string;
  ext: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  abr?: number;
  tbr?: number;
}

interface YtInfo {
  title: string;
  thumbnail: string;
  duration: number;
  uploader?: string;
  formats?: YtFormat[];
}

function mbLabel(bytes: number | null): string {
  if (!bytes) return "unknown size";
  return `~${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function estimateSize(formats: YtFormat[], maxHeight: number): number | null {
  const combined = formats
    .filter(f => f.height && f.height <= maxHeight && f.vcodec !== "none" && f.acodec && f.acodec !== "none")
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

  if (combined) return combined.filesize ?? combined.filesize_approx ?? null;

  const videoOnly = formats
    .filter(f => f.height && f.height <= maxHeight && f.vcodec !== "none" && (!f.acodec || f.acodec === "none"))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

  const audioOnly = formats
    .filter(f => (!f.vcodec || f.vcodec === "none") && f.acodec && f.acodec !== "none")
    .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];

  if (videoOnly) {
    const vs = videoOnly.filesize ?? videoOnly.filesize_approx ?? 0;
    const as_ = audioOnly ? (audioOnly.filesize ?? audioOnly.filesize_approx ?? 0) : 0;
    return (vs + as_) || null;
  }
  return null;
}

function isNotFound(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { stderr?: string };
  if (e.code === "ENOENT") return true;
  const msg = e.stderr ?? e.message ?? "";
  return msg.includes("ENOENT") || msg.includes("not found") || msg.includes("is not recognized");
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { url } = body;
  try { const p = new URL(url ?? ""); if (!["http:", "https:"].includes(p.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: "Invalid URL." }, { status: 400 }); }

  try {
    const { stdout } = await execFileAsync(
      YT_DLP_BIN,
      ["--dump-json", "--no-playlist", "--no-download", url!],
      { maxBuffer: 20 * 1024 * 1024, timeout: 30000 }
    );

    const info: YtInfo = JSON.parse(stdout);
    const formats = info.formats ?? [];

    const audioSize = (() => {
      const f = formats
        .filter(f => (!f.vcodec || f.vcodec === "none") && f.acodec && f.acodec !== "none")
        .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0];
      return f ? (f.filesize ?? f.filesize_approx ?? null) : null;
    })();

    const videoOptions = [360, 480, 720, 1080].map(height => {
      const size = estimateSize(formats, height);
      return {
        height,
        label: `${height}p`,
        size,
        sizeLabel: mbLabel(size),
        oversized: size ? size > 100 * 1024 * 1024 : false,
      };
    });

    return NextResponse.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      formats: videoOptions,
      audio: {
        size: audioSize,
        sizeLabel: mbLabel(audioSize),
        oversized: audioSize ? audioSize > 100 * 1024 * 1024 : false,
      },
    });
  } catch (err) {
    if (isNotFound(err))
      return NextResponse.json({ error: "yt-dlp not found. Run: node setup-deps.js" }, { status: 500 });
    const msg = ((err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? (err as Error).message ?? "").toLowerCase();
    if (msg.includes("unavailable") || msg.includes("private") || msg.includes("removed"))
      return NextResponse.json({ error: "Video is unavailable or private." }, { status: 400 });
    if (msg.includes("sign in") || msg.includes("login"))
      return NextResponse.json({ error: "This video requires sign-in and cannot be downloaded." }, { status: 400 });
    return NextResponse.json({ error: "Could not fetch video info. Check the URL and try again." }, { status: 500 });
  }
}
