import { existsSync } from "fs";
import { chmod, rename, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import { get as httpsGet } from "https";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "ffmpeg-static";

const IS_WIN = process.platform === "win32";
const BIN_NAME = IS_WIN ? "yt-dlp.exe" : "yt-dlp";
const localBin = join(process.cwd(), "bin", BIN_NAME);

export const YT_DLP_BIN = existsSync(localBin) ? localBin : "yt-dlp";

// ffmpeg-static resolves the correct prebuilt binary for the current
// platform/arch at install time (Windows locally, Linux on Netlify) using a
// `__dirname`-relative path. Under Next 16's Turbopack dev bundling that
// `__dirname` for a plain node_modules require can come back as an
// unsubstituted "\ROOT\..." placeholder instead of the real absolute path —
// yt-dlp then can't find ffmpeg, silently skips merging, and leaves separate
// video/audio fragments behind (surfacing as a random webm/m4a download
// instead of mp4). Verify the resolved path actually exists and fall back to
// a process.cwd()-relative lookup, which isn't subject to that rewriting.
function resolveFfmpegBin(): string | null {
  if (ffmpegPath && existsSync(ffmpegPath)) return ffmpegPath;
  const fallback = join(
    process.cwd(),
    "node_modules", "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  return existsSync(fallback) ? fallback : null;
}

export const FFMPEG_BIN: string | null = resolveFfmpegBin();

// ---------------------------------------------------------------------------
// Self-update. YouTube changes its player/cipher often enough that a yt-dlp
// binary even a few weeks old starts failing format downloads with
// "HTTP Error 403/404" even though it can still list formats. bin/yt-dlp is
// downloaded once (postinstall) and otherwise never touched, and on Netlify a
// "permanent fix" can't just mean "redeploy" since deploys are manual and
// infrequent — so self-heal at request time instead: when a download fails
// with that signature, fetch the latest release and retry once. Writes go to
// bin/ when possible (fixes it for good, survives restarts — the common case
// in local dev) and fall back to the OS tmp dir when bin/ is read-only
// (Netlify's deployed function bundle) — that fix then lasts for the life of
// the warm container, which is the best any request-time fix can do there.
// ---------------------------------------------------------------------------

const YT_DLP_ASSET = IS_WIN ? "yt-dlp.exe" : "yt-dlp_linux";
const YT_DLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_ASSET}`;
const TMP_BIN = join(tmpdir(), IS_WIN ? "yt-dlp-latest.exe" : "yt-dlp-latest");

let overrideBin: string | null = null;
let updatePromise: Promise<string | null> | null = null;

/** Current best-known yt-dlp binary path — the freshly-downloaded copy once `updateYtDlp()` has succeeded this process, otherwise the original. */
export function currentYtDlpBin(): string {
  return overrideBin ?? YT_DLP_BIN;
}

function download(url: string, dest: string, redirects = 0): Promise<void> {
  if (redirects > 10) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.tmp`;
    const file = createWriteStream(tmp);
    httpsGet(url, { headers: { "User-Agent": "utility-app-ytdlp-updater" } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        unlink(tmp).catch(() => {});
        download(res.headers.location, dest, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        unlink(tmp).catch(() => {});
        reject(new Error(`HTTP ${res.statusCode} fetching yt-dlp`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close(async () => {
          try {
            await rename(tmp, dest);
            if (!IS_WIN) await chmod(dest, 0o755);
            resolve();
          } catch (err) { reject(err); }
        });
      });
    }).on("error", err => {
      file.close();
      unlink(tmp).catch(() => {});
      reject(err);
    });
  });
}

/**
 * Downloads the latest yt-dlp release and swaps it in for subsequent calls.
 * Safe to call concurrently — every caller awaits the same in-flight attempt.
 * Returns the new binary path on success, null if the update itself failed
 * (network issue, GitHub rate limit, etc.) — callers should just retry with
 * whatever `currentYtDlpBin()` already returns in that case.
 */
export async function updateYtDlp(): Promise<string | null> {
  if (!updatePromise) {
    updatePromise = (async () => {
      // Prefer overwriting bin/ directly — a local dev filesystem is writable,
      // so this actually fixes the installed binary for good.
      try {
        await download(YT_DLP_URL, localBin);
        overrideBin = localBin;
        return localBin;
      } catch { /* bin/ likely read-only (Netlify) — fall back to tmp */ }

      try {
        await download(YT_DLP_URL, TMP_BIN);
        overrideBin = TMP_BIN;
        return TMP_BIN;
      } catch {
        return null;
      }
    })();
  }
  return updatePromise;
}

/** Does this look like YouTube rejecting a stale extractor's format URLs (as opposed to a genuinely missing/private video)? Scoped narrowly so we don't burn an update+retry on unrelated failures. */
export function looksLikeOutdatedYtDlp(stderr: string): boolean {
  return /HTTP Error 40[34]|Failed to extract any player response|unable to download video data|nsig extraction failed/i.test(stderr);
}
