// Runs the whole live suite on every browser, in order:
//   1. Chromium (stand-in for Chrome; branded Chrome ignores --load-extension)
//   2. Edge (branded msedge, headed)
//   3. Firefox (real Firefox + temporary add-on via selenium-webdriver)
// Usage: node tests/run-browsers.js [chromium] [msedge] [firefox]   (default: all)
const path = require("path");
const { spawnSync } = require("child_process");

const want = process.argv.slice(2);
const targets = (want.length ? want : ["chromium", "msedge", "firefox"]);
const failed = [];
for (const b of targets) {
  console.log(`\n########## ${b} ##########`);
  const [script, env] = b === "firefox"
    ? [path.join(__dirname, "firefox", "ff.live.js"), {}]
    : [path.join(__dirname, "live", "run-all.js"), { BROWSER: b }];
  const r = spawnSync(process.execPath, [script], { stdio: "inherit", env: { ...process.env, ...env }, timeout: 6600000 });
  if (r.error && r.error.code === "ETIMEDOUT") { console.error(`TIMEOUT: ${b} run exceeded its time limit and was killed`); failed.push(b + " (timeout)"); }
  else if (r.status !== 0) failed.push(b);
}
console.log(failed.length ? `\nFAILED browsers: ${failed.join(", ")}` : `\nAll browsers passed: ${targets.join(", ")}`);
process.exit(failed.length ? 1 : 0);
