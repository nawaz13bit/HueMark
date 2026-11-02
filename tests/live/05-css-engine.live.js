setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// CSS Custom Highlight fallback engine: forced switch when a page keeps removing our <mark>s,
// ranges painted via CSS.highlights, current-match range, scrollbar ticks, export in CSS mode.
const { createRunner, waitFor, startServer, launch, setStorage, mkTerms, markCount, anyHighlights } = require("./lib");

const FILLER = "<p>filler text</p>".repeat(120);
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>CSS engine</title></head><body>
<p>The heron stands. Another heron flies. A third heron lands.</p>
${FILLER}
<p>Late egret and a late heron at the bottom.</p>
</body></html>`;

async function sendToContentTab(probe, message) {
  return probe.evaluate(async ({ message }) => {
    const self = (await chrome.tabs.getCurrent())?.id;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id === self) continue;
      const r = await new Promise((res) => chrome.tabs.sendMessage(tab.id, message, { frameId: 0 }, (x) => res(chrome.runtime.lastError ? undefined : x)));
      if (r !== undefined && r !== null) return { tabId: tab.id, r };
    }
    return null;
  }, { message });
}

const rangeCount = (page) => page.evaluate(() => {
  let n = 0;
  for (const [name, h] of CSS.highlights) if (name.startsWith("huemark-t")) n += h.size;
  return n;
});

(async () => {
  const t = createRunner("05-css-engine");
  const srv = await startServer({ "/p": PAGE });
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms("heron", "egret"), huemark_options: { enabled: true, wholeWord: false } });
    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);
    const page = await ext.ctx.newPage();
    await page.goto(srv.url("/p"));
    await waitFor(() => markCount(page, "heron"));

    await t.check("starts on <mark> engine (4 heron marks, no ranges)", async () =>
      (await markCount(page, "heron")) === 4 && (await rangeCount(page)) === 0);

    // The page removes our marks repeatedly -> content script gives up on <mark>.
    await page.evaluate(() => {
      for (const m of document.querySelectorAll("mark.huemark-highlight")) m.replaceWith(m.textContent);
    });
    const switched = await waitFor(async () => (await rangeCount(page)) > 0 && (await markCount(page)) === 0, { timeout: 8000 });
    await t.check("page-removed marks switch to CSS engine (ranges present, no <mark>s)", async () => !!switched);
    await t.check("CSS engine paints all 5 matches (4 heron + 1 egret)", async () => (await rangeCount(page)) === 5);
    await t.check("page text untouched in CSS mode (no wrapper nodes)", async () =>
      (await page.evaluate(() => document.querySelector("p").children.length)) === 0);

    await t.check("scrollbar tick host exists in CSS mode", async () =>
      !!(await waitFor(() => page.evaluate(() => !!document.getElementById("huemark-markers-host")), { timeout: 4000 })));

    await sendToContentTab(probe, { type: "huemark:jump", term: "heron", direction: "next" });
    await t.check("jump creates huemark-current range", async () =>
      !!(await waitFor(() => page.evaluate(() => (CSS.highlights.get("huemark-current")?.size || 0) === 1), { timeout: 4000 })));

    // Export in CSS mode.
    await probe.evaluate(() => chrome.storage.session.remove("huemark_export"));
    const sent = await sendToContentTab(probe, { type: "huemark:export", names: ["heron", "egret"] });
    const stored = await waitFor(async () => {
      const s = (await probe.evaluate(() => chrome.storage.session.get("huemark_export"))).huemark_export;
      return s && s.state !== "running" ? s : null;
    }, { timeout: 20000, interval: 300 });
    await t.check("export works in CSS mode (ack + 5 rows)", async () =>
      sent?.r?.started === true && stored?.state === "ready" && stored.data.rows.length === 5);

    // Clearing terms removes ranges.
    await setStorage(ext, { huemark_terms: [] });
    await t.check("clearing terms removes CSS ranges", async () => !!(await waitFor(async () => (await anyHighlights(page)) === 0, { timeout: 6000 })));
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
