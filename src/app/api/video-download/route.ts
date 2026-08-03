import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync, readdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { YT_DLP_BIN, FFMPEG_BIN } from "@/lib/ytdlp";
import { getVideoSettings } from "@/lib/video-settings";

const FORMAT_MAP: Record<string, string> = {
  "360":  "bestvideo[height<=360]+bestaudio/best[height<=360]",
  "480":  "bestvideo[height<=480]+bestaudio/best[height<=480]",
  "720":  "bestvideo[height<=720]+bestaudio/best[height<=720]",
  "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
};

// Facebook/Instagram require a logged-in session for most videos. YouTube
// normally doesn't, but increasingly challenges datacenter IPs (e.g. Netlify's)
// with a "sign in to confirm you're not a bot" wall — cookies fix that too.
const LOGIN_WALL_HOSTS = ["facebook.com", "fb.watch", "instagram.com"];
const YOUTUBE_HOSTS = ["youtube.com", "youtu.be"];

// Path for a manually exported cookies.txt file (one-time setup, most reliable)
const COOKIES_FILE = join(process.cwd(), "bin", "cookies.txt");
// bin/ is gitignored (never commit login cookies) and Netlify's filesystem is
// read-only, so on a deployed site cookies come from the DB or an env var and
// get written to /tmp at request time instead.
const COOKIES_TMP_FILE = join(tmpdir(), "yt-dlp-cookies.txt");

function hostMatches(url: string, hosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "").replace("m.", "");
    return hosts.some(h => host.endsWith(h));
  } catch { return false; }
}

function cookiesFromEnv(): string | null {
  if (process.env.YTDLP_COOKIES_B64) {
    try { return Buffer.from(process.env.YTDLP_COOKIES_B64, "base64").toString("utf-8"); }
    catch { return null; }
  }
  return process.env.YTDLP_COOKIES ?? null;
}

// Resolves a cookies.txt in preference order:
// 1. bin/cookies.txt        — manually exported, local dev
// 2. admin panel (DB)       — set via Admin → Video Downloader, works everywhere
// 3. YTDLP_COOKIES(_B64) env — manual/CI override
async function resolvedCookieFile(): Promise<string | null> {
  if (existsSync(COOKIES_FILE)) return COOKIES_FILE;

  let cookieText: string | null = null;
  try { cookieText = (await getVideoSettings()).cookies || null; } catch { /* DB unreachable */ }
  if (!cookieText) cookieText = cookiesFromEnv();
  if (!cookieText) return null;

  try {
    writeFileSync(COOKIES_TMP_FILE, cookieText, "utf-8");
    return COOKIES_TMP_FILE;
  } catch { return null; }
}

async function cookieArgs(url: string): Promise<string[]> {
  const isLoginWall = hostMatches(url, LOGIN_WALL_HOSTS);
  const isYoutube = hostMatches(url, YOUTUBE_HOSTS);
  if (!isLoginWall && !isYoutube) return [];

  const file = await resolvedCookieFile();
  if (file) return ["--cookies", file];

  // Browser-DB extraction is a reasonable last resort for FB/IG (which almost
  // always need a session). For YouTube, which usually works cookie-free,
  // forcing this would break plain downloads on machines without Firefox.
  return isLoginWall ? ["--cookies-from-browser", "firefox"] : [];
}

function parseYtDlpError(stderr: string): string {
  const match = stderr.match(/ERROR:\s*(.+?)(?:\n|$)/i);
  if (match) return match[1].trim().slice(0, 300);
  const first = stderr.split("\n").find(l => l.trim());
  return first?.trim().slice(0, 300) || "Download failed.";
}

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(parseYtDlpError(stderr)), { stderr, ytCode: code }));
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

// When yt-dlp has no title metadata (e.g. Facebook reels), fall back to the
// video ID or last meaningful path segment from the URL.
function titleFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const numericId = [...parts].reverse().find(p => /^\d{5,}$/.test(p));
    return numericId ?? parts[parts.length - 1] ?? "video";
  } catch { return "video"; }
}

function buildFilename(rawTitle: string, ext: string): string {
  let s = rawTitle.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  if (s.length > 60) s = s.slice(0, 60).replace(/\s+\S*$/, "").trim();
  s = s.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "video";
  return `${s}.${ext}`;
}

export async function POST(req: NextRequest) {
  let body: { url?: string; format?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { url, format = "720" } = body;
  try { const p = new URL(url ?? ""); if (!["http:", "https:"].includes(p.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: "Invalid URL." }, { status: 400 }); }

  const isMp3 = format === "mp3";
  const key = randomUUID();
  const tmp = tmpdir();
  const prefix = `yt_${key}_`;
  const outTemplate = join(tmp, `${prefix}%(title)s.%(ext)s`);

  const args: string[] = [];
  if (isMp3) {
    args.push("-f", "bestaudio/best", "--extract-audio", "--audio-format", "mp3");
  } else {
    args.push("-f", FORMAT_MAP[format] ?? FORMAT_MAP["720"], "--merge-output-format", "mp4");
  }

  if (FFMPEG_BIN) args.push("--ffmpeg-location", FFMPEG_BIN);
  args.push(...(await cookieArgs(url!)));
  args.push("--max-filesize", "100m", "--no-playlist", "-o", outTemplate, url!);

  try {
    await runYtDlp(args);
    await new Promise(r => setTimeout(r, 300));
  } catch (err) {
    if (isNotFound(err))
      return NextResponse.json({ error: "yt-dlp not found. Run: node setup-deps.js" }, { status: 500 });

    const rawMsg = (err as Error).message ?? "";
    const lower = rawMsg.toLowerCase();

    if (lower.includes("ffmpeg") || lower.includes("postprocessor"))
      return NextResponse.json({ error: "ffmpeg is required for this format." }, { status: 500 });
    if (lower.includes("too large") || lower.includes("filesize"))
      return NextResponse.json({ error: "Video exceeds the 100 MB size limit." }, { status: 400 });

    // Auth/cookie checks must come before generic "not available" — Instagram uses
    // the same phrasing for both login walls and genuinely missing content.
    if (lower.includes("login") || lower.includes("sign in") || lower.includes("log in")
        || lower.includes("cookie database") || lower.includes("could not copy")) {
      return NextResponse.json({
        error: "Login required for this platform. Add cookies via Admin → Video Downloader"
          + (process.env.NETLIFY ? "." : ", or place them in bin/cookies.txt for local dev."),
      }, { status: 401 });
    }
    if (lower.includes("private") || lower.includes("not available") || lower.includes("removed"))
      return NextResponse.json({ error: "This video is private or has been removed." }, { status: 400 });

    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }

  let match: string | undefined;
  try { match = readdirSync(tmp).find(f => f.startsWith(prefix)); } catch {}

  if (!match)
    return NextResponse.json({ error: "Video exceeds 100 MB or could not be downloaded." }, { status: 400 });

  const dotIdx = match.lastIndexOf(".");
  const rawTitle = match.slice(prefix.length, dotIdx > prefix.length ? dotIdx : undefined)
                || titleFromUrl(url!);
  const actualExt = dotIdx > 0 ? match.slice(dotIdx + 1).toLowerCase() : (isMp3 ? "mp3" : "mp4");

  return NextResponse.json({ key, filename: buildFilename(rawTitle, actualExt) });
}
