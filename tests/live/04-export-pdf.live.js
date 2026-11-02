setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Markdown export (web + PDF) via the background flow, and PDF highlighting in the bundled viewer.
// Hidden-tab PDF rendering and real clipboard/badge UX stay manual (see TASKLIST.md).
const { createRunner, waitFor, startServer, launch, setStorage, mkTerms, markCount, anyHighlights, makePdf } = require("./lib");

const WEB = `<!doctype html><html><head><meta charset="utf-8"><title>Export | "Test" page</title></head><body>
<p>The heron stands still. Another heron flies. A third Heron lands near the egret.</p>
<script>var heron = "script heron must not export";</script>
</body></html>`;

const PDF = makePdf([
  ["Page one talks about the heron and the egret.", "A second line with no hit."],
  ["Page two: egret again, and a Heron."],
]);

// Send {type} to every tab; the one whose content script answers wins.
async function sendToContentTab(probe, message, excludeSelf = true) {
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

async function runExport(ext, probe, names) {
  await probe.evaluate(() => chrome.storage.session.remove("huemark_export"));
  const sent = await sendToContentTab(probe, { type: "huemark:export", names });
  const stored = await waitFor(async () => {
    const s = (await probe.evaluate(() => chrome.storage.session.get("huemark_export"))).huemark_export;
    return s && s.state !== "running" ? s : null;
  }, { timeout: 30000, interval: 300 });
  const badge = await probe.evaluate(() => chrome.action.getBadgeText({}));
  let md = null;
  if (stored?.state === "ready") {
    md = await probe.evaluate(({ data, names }) => {
      const m = (k) => chrome.i18n.getMessage(k) || "";
      const labels = { title: m("exportMdTitle"), source: m("exportMdSource"), exported: m("exportMdExported"), terms: m("exportMdTerms"),
        matches: m("exportMdMatches"), page: m("exportMdPage"), line: m("exportMdLine"), scanned: m("exportMdScanned"),
        unreadable: m("exportMdUnreadable"), none: m("exportMdNoMatches"), more: m("exportMdMore") };
      return window.__huemarkExport.toMarkdown(data, names, labels);
    }, { data: stored.data, names });
  }
  return { ack: sent?.r, stored, badge, md };
}

(async () => {
  const t = createRunner("04-export-pdf");
  const pages = { "/web": WEB, "/doc.pdf": { type: "application/pdf", body: PDF } };
  const srv = await startServer(pages);
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms("heron", "egret"), huemark_options: { enabled: true, wholeWord: false } });
    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);

    // ---- web page export
    const web = await ext.ctx.newPage();
    await web.goto(srv.url("/web"));
    await waitFor(() => markCount(web, "heron"));
    const r1 = await runExport(ext, probe, ["heron", "egret"]);
    await t.check("web: export acks immediately ({started:true})", async () => r1.ack?.started === true);
    await t.check("web: state ready, badge ✓", async () => r1.stored?.state === "ready" && r1.badge === "✓");
    await t.check("web: 4 rows (3 heron incl. capital + 1 egret), script text excluded", async () =>
      r1.stored.data.rows.length === 4 && !JSON.stringify(r1.stored.data.rows).includes("must not export"));
    await t.check("web: markdown has title, terms and bolded hits", async () =>
      !!r1.md && r1.md.includes("Export") && r1.md.includes("**heron**") && r1.md.includes("**egret**"));
    await probe.evaluate(() => chrome.runtime.sendMessage({ type: "huemark:exportClear" }));
    await t.check("exportClear resets state and badge", async () => {
      await waitFor(async () => (await probe.evaluate(() => chrome.action.getBadgeText({}))) === "");
      return !(await probe.evaluate(() => chrome.storage.session.get("huemark_export"))).huemark_export;
    });

    // ---- no-match export
    await setStorage(ext, { huemark_terms: mkTerms("zzzz-nothing") });
    await new Promise((r) => setTimeout(r, 800));
    // popup.js (the probe page) clears 'none'/'failed' the moment it sees them, so drive this
    // case from the service worker with the probe parked elsewhere.
    await probe.goto("about:blank");
    const sw = ext.ctx.serviceWorkers()[0];
    await sw.evaluate(async () => {
      await chrome.storage.session.remove("huemark_export");
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        const r = await new Promise((res) => chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names: ["zzzz-nothing"] }, { frameId: 0 }, (x) => res(chrome.runtime.lastError ? undefined : x)));
        if (r && r.started) break;
      }
    });
    const none = await waitFor(() => sw.evaluate(async () => {
      const s = (await chrome.storage.session.get("huemark_export")).huemark_export;
      return s && s.state !== "running" ? { state: s.state, badge: await chrome.action.getBadgeText({}) } : null;
    }), { timeout: 15000, interval: 200 });
    await t.check("web: no matches -> state 'none' with red ! badge, not 'ready'", async () => none?.state === "none" && none.badge === "!");
    await sw.evaluate(async () => { await chrome.storage.session.remove("huemark_export"); await chrome.action.setBadgeText({ text: "" }); });
    await probe.goto(ext.popupUrl);
    await web.close();

    // ---- PDF
    await setStorage(ext, { huemark_terms: mkTerms("heron", "egret"), huemark_options: { enabled: true, wholeWord: false } });
    const pdf = await ext.ctx.newPage();
    await pdf.goto(srv.url("/doc.pdf"));
    await t.check("PDF URL is redirected to the bundled viewer", async () =>
      (await waitFor(() => pdf.url().includes("/vendor/pdfjs/web/viewer.html"), { timeout: 10000 })));
    await t.check("PDF text layer gets highlights (3 heron/Heron + 3 egret... heron 2, egret 2)", async () => {
      await waitFor(() => pdf.evaluate(() => document.querySelectorAll("#viewer .textLayer mark.huemark-highlight").length >= 4), { timeout: 15000 });
      const n = await pdf.evaluate(() => document.querySelectorAll("#viewer .textLayer mark.huemark-highlight").length);
      return n === 4; // heron x2 + egret x2 (page 1 + page 2)
    });
    const r3 = await runExport(ext, probe, ["heron", "egret"]);
    await t.check("PDF: export ready with page numbers", async () =>
      r3.stored?.state === "ready" && r3.stored.data.rows.length === 4 && r3.stored.data.rows.every((r) => Number.isInteger(r.page)));
    await t.check("PDF: rows on pages 1 and 2, page restored to 1 afterwards", async () => {
      const pages = new Set(r3.stored.data.rows.map((r) => r.page));
      const cur = await pdf.evaluate(() => window.PDFViewerApplication?.page);
      return pages.has(1) && pages.has(2) && cur === 1;
    });
    await t.check("PDF: markdown cites pages", async () => /p\.\s?1/.test(r3.md || "") && /p\.\s?2/.test(r3.md || ""));
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
