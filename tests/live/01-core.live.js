// Core highlighting on a real page: matching, options, enable/disable, dynamic content.
const { createRunner, waitFor, startServer, launch, setStorage, mkTerms, markCount, anyHighlights } = require("./lib");

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>core</title></head><body>
<h1>Cafe society</h1>
<p id="p1">The quick brown fox. A café is not a cafeteria. FOX and fox and Foxes.</p>
<p id="p2">Résumé, resume, RESUME. Straße and strasse.</p>
<p id="p3">Wild: cat, cart, coat, cut.</p>
<p id="hidden" style="display:none">fox hidden fox</p>
<p id="invisible" style="visibility:hidden">fox invisible</p>
<script id="s">var fox = "fox in script";</script>
<textarea id="ta">fox in textarea</textarea>
<div id="dyn"></div>
</body></html>`;

(async () => {
  const t = createRunner("01-core");
  const srv = await startServer({ "/core": PAGE });
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms("fox"), huemark_options: { enabled: true, wholeWord: false } });
    const page = await ext.ctx.newPage();
    await page.goto(srv.url("/core"));

    await t.check("highlights appear for a stored term", async () =>
      (await waitFor(() => markCount(page, "fox"))) > 0);
    await t.check("case-insensitive + substring: fox/FOX/fox/Foxes = 4 visible matches", async () =>
      (await markCount(page, "fox")) === 4);
    await t.check("display:none and visibility:hidden text not highlighted", async () =>
      page.evaluate(() => !document.querySelector("#hidden mark, #invisible mark")));
    await t.check("script and textarea content untouched", async () =>
      page.evaluate(() => !document.querySelector("#s mark, #ta mark") && document.getElementById("s").textContent.includes("fox")));
    await t.check("floating bar host exists", async () =>
      (await waitFor(() => page.evaluate(() => !!document.getElementById("huemark-float-bar-host")))));
    await t.check("bar host contains no marks", async () =>
      page.evaluate(() => !document.getElementById("huemark-float-bar-host")?.querySelector("mark")));

    // whole word
    await setStorage(ext, { huemark_options: { enabled: true, wholeWord: true } });
    await t.check("whole word: only fox/FOX/fox = 3 (not Foxes)", async () =>
      (await waitFor(async () => (await markCount(page, "fox")) === 3)));

    // accent folding (always on)
    await setStorage(ext, { huemark_terms: mkTerms("cafe", "resume", "strasse"), huemark_options: { enabled: true, wholeWord: false } });
    await t.check("accent folding: 'cafe' = Cafe + café + caf(eteria) = 3", async () =>
      (await waitFor(async () => (await markCount(page, "cafe")) === 3)));
    await t.check("accent folding: 'resume' = Résumé/resume/RESUME = 3", async () =>
      (await markCount(page, "resume")) === 3);
    await t.check("FOLD_MAP: 'strasse' = Straße + strasse = 2", async () =>
      (await markCount(page, "strasse")) === 2);

    // wildcard
    await setStorage(ext, { huemark_terms: mkTerms("c?t"), huemark_options: { enabled: true, wholeWord: false } });
    await t.check("wildcard 'c?t' matches at least cat + cut", async () => {
      await waitFor(() => markCount(page, "c?t"));
      return (await markCount(page, "c?t")) >= 2;
    });

    // enabled toggle
    await setStorage(ext, { huemark_terms: mkTerms("fox"), huemark_options: { enabled: true, wholeWord: false } });
    await waitFor(() => markCount(page, "fox"));
    await setStorage(ext, { huemark_options: { enabled: false, wholeWord: false } });
    await t.check("Enabled off clears highlights and hides the bar", async () =>
      (await waitFor(async () => (await anyHighlights(page)) === 0)) &&
      (await page.evaluate(() => {
        const h = document.getElementById("huemark-float-bar-host");
        return !h || h.style.display === "none";
      })));
    await setStorage(ext, { huemark_options: { enabled: true, wholeWord: false } });
    await t.check("Enabled back on restores highlights", async () =>
      (await waitFor(async () => (await markCount(page, "fox")) === 4)));

    // dynamic content
    await page.evaluate(() => { document.getElementById("dyn").textContent = "late fox arrives"; });
    await t.check("content added after load gets highlighted (observer)", async () =>
      (await waitFor(async () => (await markCount(page, "fox")) === 5)));

    // clear terms
    await setStorage(ext, { huemark_terms: [] });
    await t.check("clearing terms removes highlights, text stays intact", async () =>
      (await waitFor(async () => (await anyHighlights(page)) === 0)) &&
      (await page.evaluate(() => document.getElementById("p1").textContent.startsWith("The quick brown fox."))));

    // persistence across reload
    await setStorage(ext, { huemark_terms: mkTerms("fox") });
    await page.reload();
    await t.check("highlights return after reload", async () => (await waitFor(() => markCount(page, "fox"))) > 0);
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
