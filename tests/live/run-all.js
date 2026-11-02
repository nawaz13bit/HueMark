// Runs every *.live.js sequentially (each launches its own Chromium) and aggregates exit codes.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".live.js")).sort();
const failed = [];
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit", timeout: 600000 });
  if (r.error && r.error.code === "ETIMEDOUT") { console.error(`TIMEOUT: ${f} exceeded 600 s and was killed`); failed.push(f + " (timeout)"); }
  else if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? `\nFAILED: ${failed.join(", ")}` : `\nAll ${files.length} live suites passed`);
process.exit(failed.length ? 1 : 0);
