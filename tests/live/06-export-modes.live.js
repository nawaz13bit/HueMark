setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Export popup controls (mode select, club checkbox, "!" explainer, saved prefs) and
// sentence/paragraph/club output built from a real collect(). PDF line-gap paragraph
// guessing with real layouts stays manual (see TASKLIST.md).
const { createRunner, waitFor, startServer, launch, setStorage, getStorage, mkTerms, markCount, makePdf } = require("./lib");

const WEB = `<!doctype html><html><head><meta charset="utf-8"><title>Modes</title></head><body>
<p id="a">The cat sat. The cat and the dog slept together. A dog barked.</p>
<p id="b">Only a cat here.</p>
</body></html>`;
const PDF = makePdf([["The heron met the egret by the lake. Nothing else happened."]]);
const PAPER = makePdf([
  ["Introduction", "The heron nests near water."],
  ["Filler page two."], ["Filler page three."], ["Filler page four."], ["Filler page five."],
  ["References", "Smith, A. 2020. The heron in winter. Birds Press."],
]);

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

async function collectData(probe, names) {
  await probe.evaluate(() => chrome.storage.session.remove("huemark_export"));
  await sendToContentTab(probe, { type: "huemark:export", names });
  const s = await waitFor(async () => {
    const x = (await probe.evaluate(() => chrome.storage.session.get("huemark_export"))).huemark_export;
    return x && x.state !== "running" ? x : null;
  }, { timeout: 30000, interval: 300 });
  return s?.state === "ready" ? s.data : null;
}

function render(probe, data, names, opts) {
  return probe.evaluate(({ data, names, opts }) => {
    const m = (k) => chrome.i18n.getMessage(k) || "";
    const labels = { title: m("exportMdTitle"), source: m("exportMdSource"), exported: m("exportMdExported"), terms: m("exportMdTerms"),
      matches: m("exportMdMatches"), page: m("exportMdPage"), line: m("exportMdLine"), scanned: m("exportMdScanned"),
      unreadable: m("exportMdUnreadable"), none: m("exportMdNoMatches"), more: m("exportMdMore"), passages: m("exportMdPassages") };
    return window.__huemarkExport.toMarkdown(data, names, labels, opts);
  }, { data, names, opts });
}

const count = (s, sub) => s.split(sub).length - 1;

(async () => {
  const t = createRunner("06-export-modes");
  const srv = await startServer({ "/w": WEB, "/doc.pdf": { type: "application/pdf", body: PDF }, "/paper.pdf": { type: "application/pdf", body: PAPER } });
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms("cat", "dog"), huemark_options: { enabled: true, wholeWord: false } });

    // ---- popup controls
    const popup = await ext.ctx.newPage();
    await popup.goto(ext.popupUrl);
    await popup.locator("#advancedSection > summary").click(); // export controls live in the Advanced accordion
    await t.check("defaults: mode=snippet, club row hidden, club checked", async () =>
      (await popup.locator("#exportMode").inputValue()) === "snippet" &&
      !(await popup.locator("#exportClubRow").isVisible()) &&
      (await popup.locator("#exportClub").isChecked()));
    await popup.locator("#exportMode").selectOption("sentence");
    await t.check("sentence mode reveals club row", async () => await popup.locator("#exportClubRow").isVisible());
    await t.check("'!' toggles explainer and aria-expanded", async () => {
      const btn = popup.locator("#exportClubInfoBtn");
      const hidden0 = !(await popup.locator("#exportClubInfo").isVisible());
      await btn.click();
      const open = await popup.locator("#exportClubInfo").isVisible();
      const exp1 = await btn.getAttribute("aria-expanded");
      await btn.click();
      const closed = !(await popup.locator("#exportClubInfo").isVisible());
      return hidden0 && open && exp1 === "true" && closed && (await btn.getAttribute("aria-expanded")) === "false";
    });
    await popup.locator("#exportClub").uncheck();
    await popup.locator("#exportMode").selectOption("paragraph");
    await t.check("prefs saved to huemark_export_prefs", async () => {
      const p = (await waitFor(async () => {
        const s = (await getStorage(ext, "huemark_export_prefs")).huemark_export_prefs;
        return s && s.mode === "paragraph" ? s : null;
      }, { timeout: 4000 }));
      return p && p.mode === "paragraph" && p.club === false;
    });
    await popup.reload();
    await t.check("prefs restored after reopening popup", async () =>
      (await popup.locator("#exportMode").inputValue()) === "paragraph" && !(await popup.locator("#exportClub").isChecked()));
    await popup.locator("#exportClub").check();
    await popup.locator("#exportMode").selectOption("snippet");
    await t.check("snippet mode hides club row again", async () => !(await popup.locator("#exportClubRow").isVisible()));

    // ---- web output
    const web = await ext.ctx.newPage();
    await web.goto(srv.url("/w"));
    await waitFor(() => markCount(web, "cat"));
    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);
    const names = ["cat", "dog"];
    const data = await collectData(probe, names);
    await t.check("collect() returns blocks and per-row blk/bs/be", async () =>
      data && data.blocks && data.rows.length === 5 && data.rows.every((r) => r.blk !== undefined && r.bs >= 0 && r.be > r.bs));

    const sentence = "The cat and the dog slept together.";
    const club = await render(probe, data, names, { mode: "sentence", club: true });
    await t.check("sentence+club: shared sentence once under 'cat + dog', bolded hits", async () =>
      club.includes("cat + dog") && count(club, "The **cat** and the **dog** slept together.") === 1);
    const repeat = await render(probe, data, names, { mode: "sentence", club: false });
    await t.check("sentence, club off: shared sentence repeats under both terms", async () =>
      count(repeat, "The **cat** and the **dog** slept together.") === 2 && !repeat.includes("cat + dog"));
    await t.check("club mode: no '(0)' empty section for a term whose hits are all shared", async () => !/\(0\)/.test(club));
    const para = await render(probe, data, names, { mode: "paragraph", club: true });
    await t.check("paragraph mode: whole paragraph with all hits bolded", async () =>
      para.includes("The **cat** sat. The **cat** and the **dog** slept together. A **dog** barked."));
    const snip = await render(probe, data, names, { mode: "snippet", club: true });
    await t.check("snippet mode: no passages header, no clubbed headers", async () =>
      !snip.includes("cat + dog") && snip.includes("**cat**"));
    void sentence;

    // ---- rich text + plain text (no Markdown on the clipboard)
    const rich = await probe.evaluate(({ data, names }) => {
      const m = (k) => chrome.i18n.getMessage(k) || "";
      const labels = { title: m("exportMdTitle"), source: m("exportMdSource"), exported: m("exportMdExported"), terms: m("exportMdTerms"),
        matches: m("exportMdMatches"), page: m("exportMdPage"), line: m("exportMdLine"), scanned: m("exportMdScanned"),
        unreadable: m("exportMdUnreadable"), none: m("exportMdNoMatches"), more: m("exportMdMore"), passages: m("exportMdPassages") };
      const o = { mode: "sentence", club: true };
      return { html: window.__huemarkExport.toHtml(data, names, labels, o), plain: window.__huemarkExport.toPlain(data, names, labels, o) };
    }, { data, names });
    await t.check("html: <b> hits, <h1>/<h2>, <ul>/<li>, no literal ** or leading #", async () =>
      rich.html.includes("The <b>cat</b> and the <b>dog</b>") && /<h1>/.test(rich.html) && /<h2>/.test(rich.html) &&
      rich.html.includes("<ul><li>") && !rich.html.includes("**") && !/^#/m.test(rich.html));
    await t.check("plain: sentence text, no **, #, > or backslash markup", async () =>
      rich.plain.includes("The cat and the dog slept together.") && !/\*\*|^#|^>|\\/m.test(rich.plain));
    await web.close();

    // ---- PDF
    await setStorage(ext, { huemark_terms: mkTerms("heron", "egret"), huemark_options: { enabled: true, wholeWord: false } });
    const pdf = await ext.ctx.newPage();
    await pdf.goto(srv.url("/doc.pdf"));
    await waitFor(() => pdf.evaluate(() => document.querySelectorAll("#viewer .textLayer mark.huemark-highlight").length >= 2), { timeout: 15000 });
    const pnames = ["heron", "egret"];
    const pdata = await collectData(probe, pnames);
    await t.check("PDF: rows carry block data", async () => pdata && pdata.rows.length === 2 && pdata.rows.every((r) => r.blk !== undefined));
    const psent = await render(probe, pdata, pnames, { mode: "sentence", club: true });
    await t.check("PDF sentence+club: one clubbed passage, 2nd sentence excluded", async () =>
      psent.includes("heron + egret") && psent.includes("**heron**") && !psent.includes("Nothing else happened"));
    const ppara = await render(probe, pdata, pnames, { mode: "paragraph", club: true });
    await t.check("PDF paragraph: contains the hit sentences", async () => ppara.includes("**egret**"));
    // Long paper: a hit in the bibliography is a reference entry, not the paper's prose.
    await pdf.close();
    const refPdf = await ext.ctx.newPage();
    await refPdf.goto(srv.url("/paper.pdf"));
    await waitFor(() => refPdf.evaluate(() => document.querySelectorAll("#viewer .textLayer mark.huemark-highlight").length >= 1), { timeout: 15000 });
    const rdata = await collectData(probe, ["heron"]);
    await t.check("PDF >4 pages: hit under References is dropped, body hit kept", async () => {
      if (!rdata) return false;
      const got = rdata.rows.map((r) => r.page + ":" + r.heading);
      if (rdata.rows.length !== 1) console.log("   rows:", got.join(" | "));
      return rdata.rows.length === 1 && rdata.rows[0].page === 1;
    });
    for (const mode of ["sentence", "paragraph"]) {
      const bolds = await probe.evaluate(({ data, names, mode }) => {
        const l = new Proxy({}, { get: (_, k) => String(k) });
        const html = window.__huemarkExport.toHtml(data, names, l, { mode, club: true });
        return [...html.matchAll(/<li>(.*?)<\/li>/g)].flatMap((m) => [...m[1].matchAll(/<b>(.*?)<\/b>/g)].map((x) => x[1]));
      }, { data: pdata, names: pnames, mode });
      const hitBolds = bolds.filter((b) => !b.endsWith(":")); // header labels are bold too
      await t.check(`PDF ${mode} html: only the hit words are bold`, async () =>
        hitBolds.length >= 2 && hitBolds.every((b) => /^(heron|egret)$/i.test(b)));
    }
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
