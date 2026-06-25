const { spawn } = require("child_process");

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  cwd: __dirname,
});

child.on("exit", (code) => process.exit(code));
