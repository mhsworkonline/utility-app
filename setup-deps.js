/**
 * Downloads yt-dlp.exe into bin/ and installs ffmpeg via winget.
 * Run once: node setup-deps.js
 */
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const BIN_DIR = path.join(__dirname, "bin");
const YT_DLP_EXE = path.join(BIN_DIR, "yt-dlp.exe");
const YT_DLP_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

function dl(url, dest, redirects = 0) {
  if (redirects > 10) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const tmp = dest + ".tmp";
    const file = fs.createWriteStream(tmp);
    proto
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(tmp); } catch {}
          return dl(res.headers.location, dest, redirects + 1).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(tmp); } catch {}
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r  ${pct}%  (${(received / 1024 / 1024).toFixed(1)} MB)`);
          }
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            process.stdout.write("\n");
            fs.renameSync(tmp, dest);
            resolve();
          });
        });
      })
      .on("error", (err) => {
        file.close();
        try { fs.unlinkSync(tmp); } catch {}
        reject(err);
      });
  });
}

function hasBin(cmd) {
  const r = spawnSync(cmd, ["--version"], { stdio: "ignore", shell: false });
  return r.status === 0;
}

async function main() {
  console.log("=== Video Downloader — dependency setup ===\n");

  // yt-dlp
  if (fs.existsSync(YT_DLP_EXE)) {
    console.log("✓ yt-dlp already present in bin/");
  } else {
    console.log("Downloading yt-dlp.exe …");
    try {
      await dl(YT_DLP_URL, YT_DLP_EXE);
      console.log("✓ yt-dlp.exe saved to bin/");
    } catch (e) {
      console.error("✗ Failed to download yt-dlp:", e.message);
      process.exit(1);
    }
  }

  // ffmpeg
  if (hasBin("ffmpeg")) {
    console.log("✓ ffmpeg already available in PATH");
  } else {
    console.log("Installing ffmpeg via winget …");
    const r = spawnSync(
      "winget",
      [
        "install",
        "--id", "Gyan.FFmpeg",
        "-e",
        "--silent",
        "--accept-source-agreements",
        "--accept-package-agreements",
      ],
      { stdio: "inherit", shell: false }
    );
    if (r.status === 0) {
      console.log("✓ ffmpeg installed — reopen your terminal to pick up PATH changes");
    } else {
      console.log("  Could not auto-install ffmpeg.");
      console.log("  MP3 and 720p+ MP4 downloads require ffmpeg.");
      console.log("  Install manually: winget install Gyan.FFmpeg");
    }
  }

  console.log("\nDone. Start the app with: npm run dev\n");
}

main();
