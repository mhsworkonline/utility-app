/**
 * Downloads the yt-dlp binary for the current platform into bin/.
 * ffmpeg is handled separately by the `ffmpeg-static` npm dependency.
 * Runs automatically via npm postinstall; safe to re-run manually.
 */
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BIN_DIR = path.join(__dirname, "bin");
const IS_WIN = process.platform === "win32";
const YT_DLP_NAME = IS_WIN ? "yt-dlp.exe" : "yt-dlp";
const YT_DLP_EXE = path.join(BIN_DIR, YT_DLP_NAME);
// yt-dlp_linux is the standalone PyInstaller build — no system python required,
// which matters on Netlify's Lambda runtime where python isn't guaranteed present.
const YT_DLP_ASSET = IS_WIN ? "yt-dlp.exe" : "yt-dlp_linux";
const YT_DLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_ASSET}`;

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

function dl(url, dest, redirects = 0) {
  if (redirects > 10) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const tmp = dest + ".tmp";
    const file = fs.createWriteStream(tmp);
    proto
      .get(url, { headers: { "User-Agent": "setup-deps.js" } }, (res) => {
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
            if (!IS_WIN) fs.chmodSync(dest, 0o755);
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

async function main() {
  console.log("=== Video Downloader — dependency setup ===\n");

  if (fs.existsSync(YT_DLP_EXE)) {
    console.log(`✓ yt-dlp already present in bin/${YT_DLP_NAME}`);
  } else {
    console.log(`Downloading ${YT_DLP_ASSET} …`);
    try {
      await dl(YT_DLP_URL, YT_DLP_EXE);
      console.log(`✓ yt-dlp saved to bin/${YT_DLP_NAME}`);
    } catch (e) {
      console.error("✗ Failed to download yt-dlp:", e.message);
      // Don't fail the whole `npm install` (e.g. offline installs, sandboxed CI)
      // — the app surfaces a clear "yt-dlp not found" error at runtime instead.
      process.exit(0);
    }
  }

  console.log("\nDone. Start the app with: npm run dev\n");
}

main();
