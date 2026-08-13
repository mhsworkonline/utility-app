import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
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

// Some videos (long streams, full uploads posted as a single "video" tweet,
// etc.) are legitimately large and can take many minutes over a slow/loaded
// connection. Past this, treat it as stuck rather than let the job run forever.
const MAX_DOWNLOAD_MS = 20 * 60 * 1000;

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

function isNotFound(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { stderr?: string };
  if (e.code === "ENOENT") return true;
  const msg = e.stderr ?? e.message ?? "";
  return msg.includes("ENOENT") || msg.includes("not found") || msg.includes("is not recognized");
}

// A stale/rotated cookie session can make yt-dlp behave *worse* than having no
// cookies at all (YouTube serves a half-authenticated, inconsistent response).
// Detect that specific warning so callers can retry once cookie-free.
function hasStaleCookies(err: unknown): boolean {
  const stderr = (err as { stderr?: string }).stderr ?? "";
  return /no longer valid|likely been rotated/i.test(stderr);
}

function errorMessage(err: unknown): string {
  if (isNotFound(err)) return "yt-dlp not found. Run: node setup-deps.js";

  const rawMsg = (err as Error).message ?? "";
  const lower = rawMsg.toLowerCase();

  if (lower.includes("ffmpeg") || lower.includes("postprocessor"))
    return "ffmpeg is required for this format.";
  if (lower.includes("too large") || lower.includes("filesize"))
    return "Video exceeds the 100 MB size limit.";
  // Auth/cookie checks must come before generic "not available" — Instagram uses
  // the same phrasing for both login walls and genuinely missing content.
  if (lower.includes("login") || lower.includes("sign in") || lower.includes("log in")
      || lower.includes("cookie database") || lower.includes("could not copy")) {
    return "Login required for this platform. Add cookies via Admin → Video Downloader"
      + (process.env.NETLIFY ? "." : ", or place them in bin/cookies.txt for local dev.");
  }
  if (lower.includes("private") || lower.includes("not available") || lower.includes("removed"))
    return "This video is private or has been removed.";

  return rawMsg || "Download failed.";
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

// ---------------------------------------------------------------------------
// Job tracking — POST kicks a download off and returns immediately; the client
// polls GET for progress. In-memory, so it only survives for the life of this
// server process (fine for local dev / a long-running Node server; a job
// won't be found if a serverless instance gets recycled mid-poll — the client
// treats that as an error rather than hanging).
// ---------------------------------------------------------------------------

interface Progress {
  percent: number | null;
  eta: string | null;
  speed: string | null;
  fragment: number | null;
  totalFragments: number | null;
}

interface Job {
  status: "downloading" | "done" | "error";
  progress: Progress;
  filename?: string;
  error?: string;
  proc?: ChildProcess;
}

const jobs = new Map<string, Job>();

function scheduleCleanup(key: string) {
  setTimeout(() => jobs.delete(key), 5 * 60 * 1000).unref?.();
}

// yt-dlp progress lines look like:
//   [download]  12.3% of ~  68.54MiB at  160.82KiB/s ETA 06:08 (frag 159/1338)
// `--newline` makes each update its own line instead of overwriting via \r,
// but split on both just in case.
const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*[\d.]+\w+(?:\s+at\s+(\S+))?\s+ETA\s+(\S+)(?:\s+\(frag\s+(\d+)\/(\d+)\))?/;

function parseProgress(line: string): Partial<Progress> | null {
  const m = PROGRESS_RE.exec(line);
  if (!m) return null;
  return {
    percent: parseFloat(m[1]),
    speed: m[2] && m[2] !== "Unknown" ? m[2] : null,
    eta: m[3] && m[3] !== "Unknown" ? m[3] : null,
    fragment: m[4] ? parseInt(m[4], 10) : null,
    totalFragments: m[5] ? parseInt(m[5], 10) : null,
  };
}

function runYtDlp(args: string[], onProgress: (p: Partial<Progress>) => void): { proc: ChildProcess; done: Promise<void> } {
  const proc = spawn(YT_DLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  let stdoutBuf = "";

  proc.stdout?.on("data", (d: Buffer) => {
    stdoutBuf += d.toString();
    const lines = stdoutBuf.split(/\r|\n/);
    stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      const p = parseProgress(line);
      if (p) onProgress(p);
    }
  });
  proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

  const done = new Promise<void>((resolve, reject) => {
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(parseYtDlpError(stderr)), { stderr, ytCode: code }));
    });
    proc.on("error", reject);
  });

  return { proc, done };
}

async function runJob(key: string, url: string, format: string) {
  const job = jobs.get(key);
  if (!job) return;

  const isMp3 = format === "mp3";
  const tmp = tmpdir();
  const prefix = `yt_${key}_`;
  const outTemplate = join(tmp, `${prefix}%(title)s.%(ext)s`);

  const formatArgs: string[] = isMp3
    ? ["-f", "bestaudio/best", "--extract-audio", "--audio-format", "mp3"]
    : ["-f", FORMAT_MAP[format] ?? FORMAT_MAP["720"], "--merge-output-format", "mp4"];
  if (FFMPEG_BIN) formatArgs.push("--ffmpeg-location", FFMPEG_BIN);

  const trailingArgs = ["--newline", "--max-filesize", "100m", "--no-playlist", "-o", outTemplate, url];
  const buildArgs = (withCookies: string[]) => [...formatArgs, ...withCookies, ...trailingArgs];

  const cookies = await cookieArgs(url);

  const onProgress = (p: Partial<Progress>) => { job.progress = { ...job.progress, ...p }; };

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    job.proc?.kill();
  }, MAX_DOWNLOAD_MS);

  try {
    try {
      const { proc, done } = runYtDlp(buildArgs(cookies), onProgress);
      job.proc = proc;
      await done;
    } catch (err) {
      // Stale cookies can make a download fail when it would've worked with
      // none at all — retry once cookie-free before surfacing an error.
      if (cookies.length && hasStaleCookies(err)) {
        const { proc, done } = runYtDlp(buildArgs([]), onProgress);
        job.proc = proc;
        await done;
      } else {
        throw err;
      }
    }
  } catch (err) {
    clearTimeout(timer);
    job.status = "error";
    job.error = timedOut
      ? "Download timed out after 20 minutes — the video may be too long or your connection too slow. Try a lower resolution."
      : errorMessage(err);
    scheduleCleanup(key);
    return;
  }
  clearTimeout(timer);

  let match: string | undefined;
  try { match = readdirSync(tmp).find(f => f.startsWith(prefix)); } catch {}

  if (!match) {
    job.status = "error";
    job.error = "Video exceeds 100 MB or could not be downloaded.";
    scheduleCleanup(key);
    return;
  }

  const dotIdx = match.lastIndexOf(".");
  const rawTitle = match.slice(prefix.length, dotIdx > prefix.length ? dotIdx : undefined)
                || titleFromUrl(url);
  const actualExt = dotIdx > 0 ? match.slice(dotIdx + 1).toLowerCase() : (isMp3 ? "mp3" : "mp4");

  job.status = "done";
  job.filename = buildFilename(rawTitle, actualExt);
  scheduleCleanup(key);
}

// Netlify (and most serverless hosts) run this route as a short-lived Lambda
// invocation: nothing guarantees code keeps running after the response is
// sent, and a later poll can land on a different, cold instance that never
// saw the job. Live progress via background job + polling only holds up on a
// persistent process (local `npm run dev`). On Netlify, fall back to the
// older behavior instead: block until the download finishes (or the
// platform's own ~10-26s function timeout kills the request) and return the
// result in this same call — no dependence on execution surviving the response.
const IS_NETLIFY = Boolean(process.env.NETLIFY);

export async function POST(req: NextRequest) {
  let body: { url?: string; format?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { url, format = "720" } = body;
  try { const p = new URL(url ?? ""); if (!["http:", "https:"].includes(p.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: "Invalid URL." }, { status: 400 }); }

  const key = randomUUID();
  jobs.set(key, {
    status: "downloading",
    progress: { percent: null, eta: null, speed: null, fragment: null, totalFragments: null },
  });

  if (IS_NETLIFY) {
    // Block so the result is ready by the time we respond — see IS_NETLIFY comment above.
    await runJob(key, url!, format);
  } else {
    // Fire-and-forget: the client polls GET below for progress/result instead
    // of holding this request open for the whole download.
    runJob(key, url!, format).catch(err => {
      const job = jobs.get(key);
      if (job) { job.status = "error"; job.error = (err as Error).message || "Download failed."; }
    });
  }

  return NextResponse.json({ key });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const job = key ? jobs.get(key) : undefined;
  if (!job) return NextResponse.json({ error: "Unknown or expired download job." }, { status: 404 });

  if (job.status === "done") return NextResponse.json({ status: "done", filename: job.filename });
  if (job.status === "error") return NextResponse.json({ status: "error", error: job.error });
  return NextResponse.json({ status: "downloading", progress: job.progress });
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const job = key ? jobs.get(key) : undefined;
  if (job) {
    job.proc?.kill();
    jobs.delete(key!);
  }
  return NextResponse.json({ ok: true });
}
