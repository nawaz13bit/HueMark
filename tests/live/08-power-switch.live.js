setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Per-tab on/off. Every tab starts OFF; the popup's Enabled switch and the floating bar's power
// button toggle only the tab they belong to. The set of "on" tab ids lives in chrome.storage.session
// (huemark_tabs_on) and must never hold URLs or hostnames.
const { createRunner, waitFor, startServer, launch, setStorage, extEval, setTabOn, getTabOn, tabIdOf, mkTerms, markCount } = require("./lib");

const html = (title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><p>A heron and another heron.</p></body></html>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t = createRunner("08-power-switch");
  const srv = await startServer({ "/a": html("Power A"), "/b": html("Power B"), "/c": html("Power C") });
  const ext = await launch();
  ext.autoOn = false; // this suite tests the OFF default itself
  try {
    await setStorage(ext, { huemark_terms: mkTerms("heron"), huemark_options: { wholeWord: false } });
    const pageA = await ext.ctx.newPage();
    await pageA.goto(srv.url("/a"));
    await sleep(1500); // give a (wrongly) enabled content script time to highlight

    // ---- new tab starts off
    await t.check("new tab starts OFF: no marks, background says off", async () =>
      (await markCount(pageA)) === 0 && (await getTabOn(ext, pageA)) === false);

    // ---- popup toggle (the popup reads the ACTIVE tab, so make pageA active before it loads)
    const popup = await ext.ctx.newPage();
    await popup.goto(ext.popupUrl);
    await pageA.bringToFront();
    await popup.reload();
    await sleep(500);
    const sw = popup.locator("#enabledToggle");
    await t.check("popup: switch is a role=switch, unchecked for an off tab, hint shown, label per-tab", async () =>
      (await sw.getAttribute("role")) === "switch" && !(await sw.isChecked()) &&
      (await sw.evaluate((e) => getComputedStyle(e).appearance)) === "none" &&
      (await popup.locator("#offHint").isVisible()) &&
      /this tab/i.test(await popup.locator("#enabledLabel").textContent()) &&
      (await sw.getAttribute("title")) === "Turn on for this tab");
    await sw.click();
    await t.check("popup: switching on highlights that tab and hides the off hint", async () => {
      const ok = await waitFor(async () => (await markCount(pageA, "heron")) === 2);
      return !!ok && (await getTabOn(ext, pageA)) === true && !(await popup.locator("#offHint").isVisible()) &&
        (await sw.getAttribute("title")) === "Turn off for this tab";
    });

    // ---- a second tab is unaffected
    const pageB = await ext.ctx.newPage();
    await pageB.goto(srv.url("/b"));
    await sleep(1200);
    await t.check("second tab is unaffected by tab A being on (still off, no marks)", async () =>
      (await markCount(pageB)) === 0 && (await getTabOn(ext, pageB)) === false && (await markCount(pageA)) === 2);
    await setTabOn(ext, pageB, true);
    await waitFor(async () => (await markCount(pageB, "heron")) === 2);

    await pageA.bringToFront();
    await popup.reload();
    await sleep(500);
    await t.check("popup (reopened on tab A) shows checked", async () => await sw.isChecked());
    await sw.click();
    await t.check("popup: switching off clears tab A only; tab B keeps its marks", async () => {
      await waitFor(async () => (await markCount(pageA)) === 0);
      return (await markCount(pageA)) === 0 && (await getTabOn(ext, pageA)) === false && (await markCount(pageB, "heron")) === 2;
    });
    await popup.close();

    // ---- floating bar power button
    await setTabOn(ext, pageA, true);
    await waitFor(async () => (await markCount(pageA, "heron")) === 2);
    await pageA.bringToFront();
    const showBar = (page) => extEval(ext, async (pat) => {
      for (const tab of await chrome.tabs.query({ url: pat })) chrome.tabs.sendMessage(tab.id, { type: "huemark:showBar" }, { frameId: 0 });
    }, "http://127.0.0.1/a*");
    const barVisible = (page) => page.evaluate(() => {
      const h = document.getElementById("huemark-float-bar-host");
      return !!h && h.style.display !== "none";
    });
    const barBtn = (page, txt) => page.evaluate((x) => {
      const b = [...document.getElementById("huemark-float-bar-host").shadowRoot.querySelectorAll(".nav button")].find((e) => e.textContent === x);
      return b ? b.title : null;
    }, txt);
    const barClick = (page, txt) => page.evaluate((x) => {
      [...document.getElementById("huemark-float-bar-host").shadowRoot.querySelectorAll(".nav button")].find((e) => e.textContent === x).click();
    }, txt);

    await showBar(pageA);
    await t.check("bar shown via showBar; power button tooltip says 'Turn off for this tab'", async () =>
      !!(await waitFor(() => barVisible(pageA))) && (await barBtn(pageA, "⏻")) === "Turn off for this tab");

    // The close button only hides the bar: the tab stays on and highlighted.
    await barClick(pageA, "✕");
    await t.check("bar ✕ only hides the bar; tab stays on and keeps its marks", async () =>
      !(await barVisible(pageA)) && (await getTabOn(ext, pageA)) === true && (await markCount(pageA, "heron")) === 2);

    await showBar(pageA);
    await waitFor(() => barVisible(pageA));
    await barClick(pageA, "⏻");
    await t.check("bar power click turns THIS tab off: marks cleared, bar hidden, tab B unaffected", async () => {
      await waitFor(async () => (await markCount(pageA)) === 0);
      return (await markCount(pageA)) === 0 && !(await barVisible(pageA)) &&
        (await getTabOn(ext, pageA)) === false && (await markCount(pageB, "heron")) === 2;
    });
    await t.check("terms are kept after power off", async () =>
      (await extEval(ext, () => chrome.storage.local.get("huemark_terms"))).huemark_terms.length === 1);

    await showBar(pageA);
    await waitFor(() => barVisible(pageA));
    await t.check("bar on an off tab shows 'Turn on for this tab'", async () => (await barBtn(pageA, "⏻")) === "Turn on for this tab");
    await barClick(pageA, "⏻");
    await t.check("bar power click on an off tab turns it back on (marks return)", async () =>
      !!(await waitFor(async () => (await markCount(pageA, "heron")) === 2)) && (await getTabOn(ext, pageA)) === true);

    // ---- export on an off tab
    await setTabOn(ext, pageB, false);
    await waitFor(async () => (await markCount(pageB)) === 0);
    await t.check("export on an off tab acks {started:false, off:true}", async () => {
      const ack = await extEval(ext, async (pat) => {
        const [tab] = await chrome.tabs.query({ url: pat });
        return new Promise((res) => chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names: ["heron"] }, { frameId: 0 }, (x) => res(chrome.runtime.lastError ? "ERR" : x)));
      }, "http://127.0.0.1/b*");
      return ack && ack.started === false && ack.off === true;
    });

    // ---- tab state is dropped when the tab closes; storage holds no URLs
    const idA = await tabIdOf(ext, pageA);
    const tabsOn = () => extEval(ext, async () => (await chrome.storage.session.get("huemark_tabs_on")).huemark_tabs_on || []);
    await t.check("session set holds A's tab id while it is on", async () => (await tabsOn()).includes(idA));
    await pageA.close();
    await t.check("closing the tab removes its id from huemark_tabs_on", async () =>
      !!(await waitFor(async () => !(await tabsOn()).includes(idA))));
    const pageC = await ext.ctx.newPage();
    await pageC.goto(srv.url("/c"));
    await sleep(1200);
    await t.check("a brand-new tab does not inherit an earlier tab's state (starts off)", async () =>
      (await markCount(pageC)) === 0 && (await getTabOn(ext, pageC)) === false);

    await setTabOn(ext, pageC, true); // leave one id in the set for the privacy check
    await waitFor(async () => (await markCount(pageC, "heron")) === 2);
    await t.check("no URLs or hostnames in chrome.storage.session or chrome.storage.local", async () => {
      const dump = await extEval(ext, async () => ({
        session: await chrome.storage.session.get(null),
        local: await chrome.storage.local.get(null),
      }));
      const text = JSON.stringify(dump);
      if (text.includes("http") || text.includes("127.0.0.1") || text.includes("localhost")) { console.log("      " + text.slice(0, 300)); return false; }
      return Array.isArray(dump.session.huemark_tabs_on);
    });
    await t.check("tab ids are plain numbers in the session set", async () => (await tabsOn()).every((x) => typeof x === "number"));
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
