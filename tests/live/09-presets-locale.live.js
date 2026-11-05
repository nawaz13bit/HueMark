setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Export presets (Matches/Citation/Research/Resume), all nine citation styles, and
// localization: every locale file has the same keys, and the popup renders translated
// preset names. Runs on BROWSER=chromium (default) or msedge.
const fs = require("fs");
const path = require("path");
const { createRunner, waitFor, startServer, launch, setStorage, mkTerms, markCount, EXT_PATH } = require("./lib");

const STYLES = ["apa", "mla", "chicago", "harvard", "ieee", "vancouver", "ama", "bluebook", "oscola", "mcgill", "aglc", "india", "de", "plain"];
const WEB = `<!doctype html><html><head><meta charset="utf-8"><title>Cite Me</title>
<meta name="author" content="Jane Doe"><meta name="citation_publication_date" content="2024/03/05"></head><body>
<h2>Skills</h2><p>Worked with python and rust daily. The python team shipped rust tooling.</p></body></html>`;

// Real-world quirks found on arXiv / PubMed / Wikipedia: label glued to text, footnote markers,
// semicolon-joined citation_authors, reference + sidebar lists, no-author pages.
const QUIRKS = `<!doctype html><html><head><meta charset="utf-8"><title>Quirk Page - Wikipedia</title>
<meta name="citation_authors" content="Polack FP;Thomas SJ"><meta name="citation_publication_date" content="2020/12/31"></head><body>
<main><p><span style="display:inline-block">Abstract:</span>The zebra runs fast.</p>
<p>The zebra was striped.<sup class="reference"><a href="#n">[7]</a></sup> It was fast<sup><a>[clarification needed]</a></sup>. Another zebra slept.</p></main>
<aside><p>Related: zebra sidebar entry.</p></aside>
<div class="references"><ol><li>Zebra reference list entry.</li></ol></div></body></html>`;

const ACCENT = `<!doctype html><html><head><meta charset="utf-8"><title>Café Études</title>
<meta name="citation_authors" content="Müller, José;Dvořák, Antonín"><meta name="citation_publication_date" content="2021/06/15"></head><body>
<main><p>El Café está listo para servir.</p></main></body></html>`;

(async () => {
  const t = createRunner("09-presets-locale");

  // ---- static locale integrity
  const root = path.join(EXT_PATH, "_locales");
  const dirs = fs.readdirSync(root);
  const en = Object.keys(JSON.parse(fs.readFileSync(path.join(root, "en", "messages.json"), "utf8")));
  await t.check(`13 locales present, each with all ${en.length} keys`, async () =>
    dirs.length === 13 && dirs.every((d) => {
      const k = Object.keys(JSON.parse(fs.readFileSync(path.join(root, d, "messages.json"), "utf8")));
      return en.every((x) => k.includes(x));
    }));
  await t.check("PDF.js viewer locale folders exist for every locale", async () => {
    const base = path.join(EXT_PATH, "vendor", "pdfjs", "web", "locale");
    return ["ar", "de", "es-ES", "fr", "hi-IN", "it", "ja", "ko", "pt-BR", "ru", "zh-CN", "zh-TW", "en-US"]
      .every((l) => fs.existsSync(path.join(base, l, "viewer.ftl")));
  });

  const srv = await startServer({ "/w": WEB });
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms("python", "rust"), huemark_options: { enabled: true, wholeWord: false } });
    const page = await ext.ctx.newPage();
    await page.goto(srv.url("/w"));
    await waitFor(async () => (await markCount(page)) >= 4 || (await page.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });

    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);

    await probe.bringToFront();
    const data = await probe.evaluate(async (url) => {
      await chrome.storage.session.remove("huemark_export");
      const tabs = await chrome.tabs.query({ url: "http://*/*" });
      for (const tab of tabs) await new Promise((r) => chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names: ["python", "rust"] }, { frameId: 0 }, () => { void chrome.runtime.lastError; r(); }));
      for (let i = 0; i < 100; i++) {
        const x = (await chrome.storage.session.get("huemark_export")).huemark_export;
        if (x && x.state !== "running") return x.state === "ready" ? x.data : null;
        await new Promise((r) => setTimeout(r, 300));
      }
      return null;
    });
    await t.check("collect returns rows", async () => data && data.rows.length >= 4);

    const render = (opts) => probe.evaluate(({ data, opts }) => {
      const m = (k) => chrome.i18n.getMessage(k) || "";
      const labels = { title: m("exportMdTitle"), source: m("exportMdSource"), exported: m("exportMdExported"), terms: m("exportMdTerms"),
        matches: m("exportMdMatches"), page: m("exportMdPage"), line: m("exportMdLine"), none: m("exportMdNoMatches"), more: m("exportMdMore"),
        passages: m("exportMdPassages"), citeTitle: m("exportCiteTitle"), citeQuotes: m("exportCiteQuotes"), citeReference: m("exportCiteReference") };
      const x = window.__huemarkExport;
      const fn = { citation: x.toCitations, research: x.toResearch, resume: x.toResume }[opts.preset] || x.toMarkdown;
      return fn(data, ["python", "rust"], labels, opts);
    }, { data, opts });

    await t.check("Matches preset lists both terms", async () => {
      const md = await render({ preset: "matches", mode: "snippet", club: true });
      return /python/i.test(md) && /rust/i.test(md);
    });
    for (const style of STYLES) {
      await t.check(`Citation preset renders in ${style}`, async () => {
        const md = await render({ preset: "citation", mode: "sentence", style, club: true });
        return /python/i.test(md) && /Cite Me|Doe/.test(md) && md.length > 80;
      });
    }
    await t.check("Citation styles produce distinct output", async () => {
      const outs = new Set();
      for (const style of STYLES) outs.add(await render({ preset: "citation", mode: "sentence", style, club: true }));
      return outs.size >= 8;
    });
    await t.check("Research preset renders with heading context", async () => {
      const md = await render({ preset: "research", mode: "paragraph", club: true });
      return /python/i.test(md) && /Skills|Research notes/.test(md);
    });
    await t.check("Resume preset renders coverage", async () => {
      const md = await render({ preset: "resume", mode: "snippet", club: true });
      return /python/i.test(md) && /rust/i.test(md) && /Resume screen|Coverage/.test(md);
    });

    // ---- real-world quirks
    const srv2 = await startServer({ "/q": QUIRKS });
    try {
      await page.close();
      await setStorage(ext, { huemark_terms: mkTerms("zebra"), huemark_options: { enabled: true, wholeWord: false } });
      const qp = await ext.ctx.newPage();
      await qp.goto(srv2.url("/q"));
      await waitFor(async () => (await markCount(qp)) >= 3 || (await qp.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
      await probe.bringToFront();
      const qd = await probe.evaluate(async () => {
        await chrome.storage.session.remove("huemark_export");
        const tabs = await chrome.tabs.query({ url: "http://*/*" });
        for (const tab of tabs) await new Promise((r) => chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names: ["zebra"] }, { frameId: 0 }, () => { void chrome.runtime.lastError; r(); }));
        for (let i = 0; i < 100; i++) {
          const x = (await chrome.storage.session.get("huemark_export")).huemark_export;
          if (x && x.state !== "running") return x.state === "ready" ? x.data : null;
          await new Promise((r) => setTimeout(r, 300));
        }
        return null;
      });
      const qr = (opts) => probe.evaluate(({ qd, opts }) => {
        const m = (k) => chrome.i18n.getMessage(k) || "";
        const labels = { citeTitle: m("exportCiteTitle"), citeQuotes: m("exportCiteQuotes"), citeReference: m("exportCiteReference"), none: m("exportMdNoMatches"), more: m("exportMdMore") };
        return window.__huemarkExport.toCitations(qd, ["zebra"], labels, opts);
      }, { qd, opts });
      const md = qd ? await qr({ preset: "citation", mode: "sentence", style: "chicago", club: true }) : "";
      await t.check("label and text are not glued (\"Abstract: The zebra\")", async () => /Abstract: The zebra/.test(md));
      await t.check("footnote markers [7] / [clarification needed] are dropped, sentences intact", async () =>
        !/\[7\]|clarification|\\\[/.test(md) && /The zebra was striped\./.test(md) && /Another zebra slept\./.test(md));
      await t.check("sidebar and reference-list matches are left out of citations", async () => !/sidebar|reference list/i.test(md));
      await t.check("semicolon-joined citation_authors become authors (APA: Polack & Thomas)", async () =>
        /Polack, F\. P\., & Thomas, S\. J\./.test(await qr({ preset: "citation", mode: "sentence", style: "apa", club: true })));
      await t.check("\" - Wikipedia\" title suffix is stripped", async () => /^# .*Quirk Page\s*$/m.test(md));
    } finally { await srv2.close(); }

    // ---- accented authors / titles / quotes (diacritics must survive, folding must still match)
    const srv3 = await startServer({ "/a": ACCENT });
    try {
      const ap = await ext.ctx.newPage();
      await setStorage(ext, { huemark_terms: mkTerms("cafe"), huemark_options: { enabled: true, wholeWord: false } });
      await ap.goto(srv3.url("/a"));
      await waitFor(async () => (await markCount(ap)) >= 1 || (await ap.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
      await probe.bringToFront();
      const ad = await probe.evaluate(async () => {
        await chrome.storage.session.remove("huemark_export");
        const tabs = await chrome.tabs.query({ url: "http://*/a" });
        for (const tab of tabs) await new Promise((r) => chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names: ["cafe"] }, { frameId: 0 }, () => { void chrome.runtime.lastError; r(); }));
        for (let i = 0; i < 100; i++) {
          const x = (await chrome.storage.session.get("huemark_export")).huemark_export;
          if (x && x.state !== "running") return x.state === "ready" ? x.data : null;
          await new Promise((r) => setTimeout(r, 300));
        }
        return null;
      });
      const ar = (opts) => probe.evaluate(({ ad, opts }) => {
        const m = (k) => chrome.i18n.getMessage(k) || "";
        const labels = { citeTitle: m("exportCiteTitle"), citeQuotes: m("exportCiteQuotes"), citeReference: m("exportCiteReference"), none: m("exportMdNoMatches"), more: m("exportMdMore") };
        return window.__huemarkExport.toCitations(ad, ["cafe"], labels, opts);
      }, { ad, opts });
      const get = async (style) => (ad ? ar({ preset: "citation", mode: "sentence", style, club: true }) : "");
      await t.check("accent-folded term \"cafe\" matches \"Café\" and the quote keeps its accent", async () => /Café/.test(await get("apa")));
      await t.check("APA keeps diacritics in author names (Müller, J., & Dvořák, A.)", async () => /Müller, J\., & Dvořák, A\./.test(await get("apa")));
      await t.check("MLA keeps diacritics (Müller, José, and Antonín Dvořák)", async () => /Müller, José/.test(await get("mla")) && /Dvořák/.test(await get("mla")));
      await t.check("title with diacritics survives in Chicago/Harvard/IEEE", async () => {
        for (const s of ["chicago", "harvard", "ieee"]) if (!/Études/.test(await get(s))) return false;
        return true;
      });
      await t.check("no mojibake or stripped letters in any style", async () => {
        for (const s of STYLES) { const o = await get(s); if (/�|Mller|Dvok|\\u00/.test(o) || !/Dvořák|Dvorak/.test(o)) return false; }
        return true;
      });
    } finally { await srv3.close(); }

    // ---- popup preset UI
    const popup = await ext.ctx.newPage();
    await popup.goto(ext.popupUrl);
    await popup.locator("#advancedSection > summary").click(); // export controls live in the Advanced accordion
    await t.check("Format select offers 5 presets; Style select offers 8 styles; Legal style select offers 22", async () =>
      (await popup.locator("#exportPreset option").count()) === 5 && (await popup.locator("#exportStyle option").count()) === 8
      && (await popup.locator("#exportLegalStyle option").count()) === 22);
    await t.check("Legal preset shows only the legal style select; Citation hides it", async () => {
      const vis = (id) => popup.evaluate((i) => getComputedStyle(document.getElementById(i)).display !== "none", id);
      await popup.locator("#exportPreset").selectOption("legal");
      const a = (await vis("exportLegalStyle")) && !(await vis("exportStyle"));
      await popup.locator("#exportPreset").selectOption("citation");
      const b = !(await vis("exportLegalStyle")) && (await vis("exportStyle"));
      return a && b;
    });
    await t.check("Citation preset shows Style; Matches hides it", async () => {
      await popup.locator("#exportPreset").selectOption("citation");
      // Check what is actually rendered (computed display), not just the hidden attribute.
      const hidden = () => popup.evaluate(() => getComputedStyle(document.getElementById("exportStyleRow")).display === "none");
      const shown = !(await hidden());
      await popup.locator("#exportPreset").selectOption("matches");
      const m = await hidden();
      await popup.locator("#exportPreset").selectOption("research");
      const r = await hidden();
      await popup.locator("#exportPreset").selectOption("resume");
      return shown && m && r && (await hidden());
    });
  } finally {
    await ext.close();
    await srv.close();
  }

  // ---- popup renders translated preset names under a non-English UI locale
  for (const [loc, word] of [["de", "Zitat"], ["fr", "Citation"], ["es", "Cita"]]) {
    const e2 = await launch({ locale: loc, args: [`--lang=${loc}`] });
    try {
      const p = await e2.ctx.newPage();
      await p.goto(e2.popupUrl);
      await t.check(`popup shows localized Format options (${loc})`, async () => {
        const opts = await p.locator("#exportPreset option").allTextContents();
        return opts.length === 5 && opts.some((o) => o.includes(word)) && !opts.includes("Matches");
      });
    } finally { await e2.close(); }
  }
  process.exit(t.summary() ? 0 : 1);
})();
