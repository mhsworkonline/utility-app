import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWriteStream, renameSync, unlinkSync } from "fs";
import https from "https";
import http from "http";
import { join } from "path";
import { IncomingMessage } from "http";
import { YT_DLP_BIN } from "@/lib/ytdlp";

const execFileAsync = promisify(execFile);
const YT_DLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

async function getVersion(bin: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 8000 });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function dlFile(url: string, dest: string, hops = 0): Promise<void> {
  if (hops > 10) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const tmp = `${dest}.tmp`;
    const file = createWriteStream(tmp);

    const cleanup = () => { try { unlinkSync(tmp); } catch {} };

    proto.get(url, (res: IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); cleanup();
        return dlFile(res.headers.location, dest, hops + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); cleanup();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          try { renameSync(tmp, dest); resolve(); }
          catch (e) { cleanup(); reject(e); }
        });
      });
    }).on("error", (err) => { file.close(); cleanup(); reject(err); });
  });
}

// GET — returns current installed version
export async function GET() {
  const version = await getVersion(YT_DLP_BIN);
  return NextResponse.json({ version });
}

// POST — downloads the latest yt-dlp.exe and replaces the current binary
export async function POST() {
  const oldVersion = await getVersion(YT_DLP_BIN);

  // Write to the same path as the running binary; fall back to bin/yt-dlp.exe
  const dest = YT_DLP_BIN !== "yt-dlp"
    ? YT_DLP_BIN
    : join(process.cwd(), "bin", "yt-dlp.exe");

  try {
    await dlFile(YT_DLP_URL, dest);
  } catch (err) {
    return NextResponse.json(
      { error: `Download failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  const newVersion = await getVersion(dest);
  return NextResponse.json({ oldVersion, newVersion, updated: oldVersion !== newVersion });
}
