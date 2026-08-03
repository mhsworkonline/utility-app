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
// platform/arch at install time (Windows locally, Linux on Netlify).
export const FFMPEG_BIN: string | null = ffmpegPath;
