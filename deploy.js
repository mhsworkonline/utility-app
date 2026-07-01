const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Load .env.local for NETLIFY_AUTH_TOKEN
const envFile = path.join(__dirname, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
}

const msg = process.argv[2] || `deploy: ${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`;

function run(cmd, env = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: __dirname, env: { ...process.env, ...env } });
}

try {
  // ── 1. Push to GitHub ──────────────────────────────────────────────────────
  console.log("\n── GitHub ──────────────────────────────────────");
  run("git add -A");
  try {
    run(`git commit -m "${msg}"`);
  } catch {
    console.log("Nothing to commit — skipping.");
  }
  run("git push origin main");

  // ── 2. Wait for Netlify auto-deploy ───────────────────────────────────────
  if (!process.env.NETLIFY_AUTH_TOKEN) {
    console.log("\nNETLIFY_AUTH_TOKEN not set in .env.local — skipping Netlify watch.");
    process.exit(0);
  }

  console.log("\n── Netlify ─────────────────────────────────────");
  run("netlify watch", { NETLIFY_AUTH_TOKEN: process.env.NETLIFY_AUTH_TOKEN });

  console.log("\n✓ Done. Live at https://neon-alfajores-368f85.netlify.app\n");
} catch (e) {
  console.error("\n✗ Deploy failed.");
  process.exit(1);
}
