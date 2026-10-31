// Popup Enabled switch (styled checkbox) and the floating bar's power button.
const { createRunner, waitFor, startServer, launch, setStorage, getStorage, mkTerms, markCount } = require("./lib");

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Power</title></head><body><p>A heron and another heron.</p></body></html>`;

(async () => {
  const t = createRunner("08-power-switch");
  const srv = await startServer({ "/p": PAGE });
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms("heron"), huemark_options: { enabled: true, wholeWord: false } });
    const page = await ext.ctx.newPage();
    await page.goto(srv.url("/p"));
    await waitFor(() => markCount(page, "heron"));

    const popup = await ext.ctx.newPage();
    await popup.goto(ext.popupUrl);
    const sw = popup.locator("#enabledToggle");
    await t.check("switch: role=switch, checked, appearance none", async () =>
      (await sw.getAttribute("role")) === "switch" && (await sw.isChecked()) &&
      (await sw.evaluate((e) => getComputedStyle(e).appearance)) === "none");
    await sw.click();
    await t.check("clicking switch disables (marks gone, storage enabled=false)", async () => {
      await waitFor(async () => (await markCount(page)) === 0);
      return (await markCount(page)) === 0 && (await getStorage(ext, "huemark_options")).huemark_options.enabled === false;
    });
    await sw.click();
    await t.check("clicking again re-enables (marks back)", async () => !!(await waitFor(async () => (await markCount(page, "heron")) === 2)));
    await popup.close();

    // Floating bar power button.
    await page.bringToFront();
    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);
    await probe.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: "http://127.0.0.1/*" });
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: "huemark:showBar" });
    });
    const visible = () => page.evaluate(() => {
      const h = document.getElementById("huemark-float-bar-host");
      return !!h && h.style.display !== "none";
    });
    await t.check("bar shown via showBar", async () => !!(await waitFor(visible)));
    await t.check("power button present with tooltip", async () =>
      (await page.evaluate(() => {
        const b = [...document.getElementById("huemark-float-bar-host").shadowRoot.querySelectorAll(".nav button")].find((x) => x.textContent === "⏻");
        return b ? b.title : "";
      })) === "Turn HueMark off");
    await page.evaluate(() => {
      [...document.getElementById("huemark-float-bar-host").shadowRoot.querySelectorAll(".nav button")].find((x) => x.textContent === "⏻").click();
    });
    await t.check("power click: enabled=false, highlights cleared, bar hidden", async () => {
      await waitFor(async () => (await markCount(page)) === 0);
      const opts = (await getStorage(ext, "huemark_options")).huemark_options;
      return opts.enabled === false && opts.wholeWord === false && (await markCount(page)) === 0 && !(await visible());
    });
    await t.check("terms are kept", async () => (await getStorage(ext, "huemark_terms")).huemark_terms.length === 1);
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
