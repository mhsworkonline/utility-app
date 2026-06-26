import { existsSync } from "fs";
import { join } from "path";

const localBin = join(
  process.cwd(),
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

export const YT_DLP_BIN = existsSync(localBin) ? localBin : "yt-dlp";
