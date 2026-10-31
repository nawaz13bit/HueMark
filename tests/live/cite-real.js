// Manual/online check: run the Citation preset on real public documents, all styles.
// Usage: node tests/live/cite-real.js <url> <term1,term2> [mode] [style,...]
// Prints the Markdown, the plain text and the HTML a paste would produce. Needs network.
const { waitFor, launch, setStorage, mkTerms } = require("./lib");

const [url, termArg, mode = "sentence", styleArg] = process.argv.slice(2);
const STYLES = styleArg ? styleArg.split(",") : ["apa", "mla", "chicago", "harvard", "ieee", "vancouver", "ama", "bluebook", "plain"];
const names = termArg.split(",");

(async () => {
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms(...names), huemark_options: { enabled: true, wholeWord: true } });
    const page = await ext.ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => console.log("goto:", e.message.split("\n")[0]));
    await new Promise((r) => setTimeout(r, Number(process.env.WAIT_MS) || 6000));
    if (process.env.DUMP_META) {
      console.log(await page.evaluate(() => [...document.querySelectorAll("meta")].filter((m) => /auth|creat|contrib/i.test(m.name + m.getAttribute("property"))).map((m) => `${m.name || m.getAttribute("property")} = ${(m.content || "").slice(0, 120)}`).join("\n")));
    }
    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);
    const data = await probe.evaluate(async ({ names }) => {
      await chrome.storage.session.remove("huemark_export");
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) await new Promise((r) => chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names }, { frameId: 0 }, () => { void chrome.runtime.lastError; r(); }));
      for (let i = 0; i < 600; i++) {
        const x = (await chrome.storage.session.get("huemark_export")).huemark_export;
        if (x && x.state !== "running" && x.state) return x;
        await new Promise((r) => setTimeout(r, 300));
      }
      return null;
    }, { names });
    console.log("state:", data && data.state, "rows:", data && data.data && data.data.rows.length);
    if (!data || data.state !== "ready") {
      console.log("page url:", page.url(), "| title:", await page.title().catch(() => "?"));
      console.log("marks:", await page.evaluate(() => document.querySelectorAll("mark.huemark-highlight").length + " / css " + (CSS.highlights ? CSS.highlights.size : 0)).catch(() => "?"));
      return;
    }
    console.log("meta:", JSON.stringify(data.data.meta));
    for (const style of STYLES) {
      const out = await probe.evaluate(({ data, names, style, mode }) => {
        const m = (k) => chrome.i18n.getMessage(k) || "";
        const labels = { title: m("exportMdTitle"), source: m("exportMdSource"), exported: m("exportMdExported"), terms: m("exportMdTerms"),
          matches: m("exportMdMatches"), page: m("exportMdPage"), line: m("exportMdLine"), none: m("exportMdNoMatches"), more: m("exportMdMore"),
          passages: m("exportMdPassages"), citeTitle: m("exportCiteTitle"), citeQuotes: m("exportCiteQuotes"), citeReference: m("exportCiteReference") };
        const o = { preset: "citation", mode, style, club: true };
        const x = window.__huemarkExport;
        return { md: x.toCitations(data, names, labels, o), plain: x.toPlain(data, names, labels, o), html: x.toHtml(data, names, labels, o) };
      }, { data: data.data, names, style, mode });
      const cap = (s) => { const l = s.split("\n"); return l.length <= 24 ? s : [...l.slice(0, 10), "...", ...l.slice(-12)].join("\n"); };
      console.log(`\n===== ${style} =====\n${cap(out.md)}\n--- plain ---\n${cap(out.plain)}`);
      if (process.env.SHOW_HTML) console.log("--- html ---\n" + out.html.slice(0, 1200));
    }
  } finally { await ext.close(); }
})();
