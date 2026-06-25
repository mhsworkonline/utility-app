const { execSync } = require("child_process");

const msg = process.argv[2] || `deploy: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: __dirname });
}

try {
  run("git add -A");
  run(`git commit -m "${msg}"`);
  run("git push origin main");
  console.log("\nDeployed successfully.");
} catch (e) {
  process.exit(1);
}
