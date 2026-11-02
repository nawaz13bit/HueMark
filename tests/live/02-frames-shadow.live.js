setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Iframes (same-origin, cross-origin, srcdoc, about:blank) and shadow DOM (open + closed).
// Covers the manual-queue items that CAN be automated; see TASKLIST.md for what stays manual.
const { createRunner, waitFor, startServer, launch, setStorage, setTabOn, mkTerms, markCount, anyHighlights } = require("./lib");

const MAIN = (srv) => `<!doctype html><html><head><meta charset="utf-8"><title>frames</title></head><body>
<p>top: needle one</p>
<iframe id="same" src="/inner" width="300" height="100"></iframe>
<iframe id="cross" src="${srv.crossUrl("/inner")}" width="300" height="100"></iframe>
<iframe id="srcdoc" srcdoc="<p>srcdoc needle</p>" width="300" height="60"></iframe>
<iframe id="blank" width="300" height="60"></iframe>
<div id="openhost"></div>
<div id="closedhost"></div>
<div style="height:3000px"></div>
<p id="far">far down needle</p>
<script>
  const o = document.getElementById("openhost").attachShadow({ mode: "open" });
  o.innerHTML = "<p>open shadow needle</p>";
  const c = document.getElementById("closedhost").attachShadow({ mode: "closed" });
  c.innerHTML = "<p>closed shadow needle</p>";
  window.__closed = c; // test-only handle for assertions
  const b = document.getElementById("blank").contentDocument;
  b.open(); b.write("<p>about:blank needle</p>"); b.close();
</script></body></html>`;

const INNER = `<!doctype html><html><body><p>inner frame needle needle</p></body></html>`;

(async () => {
  const t = createRunner("02-frames-shadow");
  const pages = {};
  const srv = await startServer(pages);
  pages["/main"] = MAIN(srv);
  pages["/inner"] = INNER;
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms("needle"), huemark_options: { enabled: true, wholeWord: false } });
    const page = await ext.ctx.newPage();
    await page.goto(srv.url("/main"));
    await waitFor(() => markCount(page, "needle"));
    await new Promise((r) => setTimeout(r, 1500)); // let child frames finish

    const frameByName = async (sel) => (await (await page.$(sel)).contentFrame());
    if (process.env.DEBUG_FRAMES) {
      for (const f of page.frames()) console.log("  frame", f.url(), await markCount(f, "needle").catch((e) => "ERR " + e.message));
    }

    await t.check("top document highlighted", async () => (await markCount(page, "needle")) >= 1);
    await t.check("same-origin iframe highlighted (2 matches)", async () =>
      (await markCount(await frameByName("#same"), "needle")) === 2);
    // Was intermittent (~20% of runs): the cross-origin frame's first scan ran before it had layout
    // (body.checkVisibility() false -> all text "hidden"). Fixed by rescanIfNowVisible() in content.js.
    await t.check("cross-origin iframe highlighted (2 matches)", async () =>
      (await waitFor(async () => (await markCount(await frameByName("#cross"), "needle")) === 2)));
    await t.check("srcdoc iframe highlighted (match_about_blank)", async () =>
      (await waitFor(async () => (await markCount(await frameByName("#srcdoc"), "needle")) === 1)));
    await t.check("about:blank iframe (script-written) highlighted", async () =>
      (await waitFor(async () => (await markCount(await frameByName("#blank"), "needle")) === 1)));
    await t.check("open shadow root highlighted", async () =>
      page.evaluate(() => document.getElementById("openhost").shadowRoot.querySelectorAll("mark.huemark-highlight").length === 1
        || (CSS.highlights && [...CSS.highlights.keys()].some((k) => k.startsWith("huemark-t")))));
    await t.check("CLOSED shadow root highlighted (openOrClosedShadowRoot reaches it)", async () =>
      (await waitFor(() => page.evaluate(() => window.__closed.querySelectorAll("mark.huemark-highlight").length === 1))));

    // Aggregated counts across frames via the real background relay.
    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);
    const counts = await waitFor(() => probe.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      const r = await new Promise((res) => chrome.tabs.sendMessage(tab.id, { type: "huemark:getCounts", terms: ["needle"] }, { frameId: 0 }, res));
      return r && r.needle && r.needle.count ? r.needle : null;
    }, srv.url("/main")), { timeout: 8000 });
    // top 1 + same 2 + cross 2 + srcdoc 1 + blank 1 + open 1 + closed 1 + far 1 = 10
    await t.check("getCounts totals across frames + shadow roots = 10", async () => counts && counts.count === 10);
    await t.check("getCounts reports a current index", async () => counts && Number.isInteger(counts.current));

    // Next-jump from the top frame walks into iframes / scrolls the page.
    // 10 jumps wrap back to the start, so record the furthest scroll seen en route.
    // The probe tab is in front; smooth scrolling doesn't run in a background tab.
    await page.bringToFront();
    await page.evaluate(() => {
      window.__maxY = 0;
      window.addEventListener("scroll", () => { window.__maxY = Math.max(window.__maxY, window.scrollY); }, { passive: true });
    });
    const jumped = await probe.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      const out = [];
      for (let i = 0; i < 10; i++) {
        out.push(await new Promise((res) => chrome.tabs.sendMessage(tab.id, { type: "huemark:jump", term: "needle", direction: "next" }, { frameId: 0 }, res)));
        await new Promise((r) => setTimeout(r, 500)); // let a smooth scroll land before the next jump
      }
      return out;
    }, srv.url("/main"));
    await t.check("10 next-jumps complete without error", async () => Array.isArray(jumped) && jumped.length === 10);
    if (process.env.DEBUG_FRAMES) console.log("  jump results:", JSON.stringify(jumped), "maxY", await page.evaluate(() => window.__maxY));
    await t.check("jumping scrolled the page down to the far match", async () =>
      (await waitFor(() => page.evaluate(() => window.__maxY > 500))));

    // Dynamic iframe added after load.
    await page.evaluate(() => {
      const f = document.createElement("iframe");
      f.id = "late"; f.srcdoc = "<p>late needle</p>"; document.body.prepend(f);
    });
    await t.check("iframe added after load gets highlighted", async () =>
      (await waitFor(async () => (await markCount(await frameByName("#late"), "needle")) === 1, { timeout: 8000 })));

    // Disable clears frames too.
    await setTabOn(ext, page, false);
    await t.check("Tab off clears top + same + cross-origin frames", async () => {
      const ok = await waitFor(async () =>
        (await anyHighlights(page)) === 0 &&
        (await anyHighlights(await frameByName("#same"))) === 0 &&
        (await anyHighlights(await frameByName("#cross"))) === 0, { timeout: 8000 });
      return ok;
    });
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
