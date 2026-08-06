import { existsSync } from "fs";
import { join } from "path";
import ffmpegPath from "ffmpeg-static";

const localBin = join(
  process.cwd(),
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

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
