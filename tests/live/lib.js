// Shared harness for the live (real Chromium + real unpacked extension) tests.
// Needs Playwright resolvable from node (found in C:\Users\fnawa\node_modules).
// Run one:  node tests/live/01-core.live.js     Run all:  node tests/live/run-all.js

const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const EXT_PATH = path.resolve(__dirname, "..", "..");

// ---- tiny check framework -------------------------------------------------
function createRunner(name) {
  const results = [];
  return {
    async check(label, fn) {
      try {
        const out = await fn();
        const ok = out === undefined ? true : !!out;
        results.push({ label, ok });
        console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
      } catch (e) {
        results.push({ label, ok: false });
        console.log(`FAIL  ${label}\n      ${String(e.message || e).split("\n")[0]}`);
      }
    },
    summary() {
      const failed = results.filter((r) => !r.ok).length;
      console.log(`\n${name}: ${results.length - failed}/${results.length} passed`);
      return failed === 0;
    },
  };
}

// Polls fn until truthy (or timeout). Returns the last value.
async function waitFor(fn, { timeout = 5000, interval = 100 } = {}) {
  const end = Date.now() + timeout;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, interval));
  }
  return v;
}

// ---- fixture server -------------------------------------------------------
// pages: { "/path": "<html>" | (req) => "<html>" }. Returns { url(path), close() }.
function startServer(pages, port = 0) {
  const server = http.createServer((req, res) => {
    const p = req.url.split("?")[0];
    const body = pages[p];
    if (body === undefined) { res.writeHead(404); res.end("not found"); return; }
    const out = typeof body === "function" ? body(req) : body;
    if (out && out.type) { // { type, body } for non-HTML (e.g. application/pdf)
      res.writeHead(200, { "content-type": out.type });
      res.end(out.body);
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(out);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address();
      resolve({
        port: p,
        url: (route) => `http://127.0.0.1:${p}${route}`,
        // "localhost" is a different origin from 127.0.0.1: handy for cross-origin frames.
        crossUrl: (route) => `http://localhost:${p}${route}`,
        // Chromium keeps connections alive; close() alone would wait for them forever.
        close: () => new Promise((r) => { server.close(r); if (server.closeAllConnections) server.closeAllConnections(); }),
      });
    });
  });
}

// ---- extension launch -----------------------------------------------------
// BROWSER=chromium (default; stands in for Chrome, whose branded builds ignore
// --load-extension) or BROWSER=msedge (branded Edge, always headed).
async function launch(opts = {}) {
  const { headless = true, args = [], locale } = opts;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "huemark-live-"));
  const edge = process.env.BROWSER === "msedge";
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: edge ? "msedge" : "chromium",
    headless: edge ? false : headless,
    ...(locale ? { locale } : {}),
    ...(opts.deviceScaleFactor ? { deviceScaleFactor: opts.deviceScaleFactor } : {}),
    args: [
      `--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`,
      ...(edge ? ["--disable-features=DisableLoadExtensionCommandLineSwitch"] : []),
      ...args,
    ],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  // onInstalled seeds huemark_terms: [] shortly after load and would overwrite
  // data written too early.
  await new Promise((r) => setTimeout(r, 2000));
  const ext = {
    ctx,
    extId,
    popupUrl: `chrome-extension://${extId}/src/popup.html`,
    // Every tab starts OFF (per-tab switch). While autoOn is true, the first page.goto() of each
    // page created with ctx.newPage() to an http(s) URL or the PDF viewer switches that tab ON.
    // Suites that test the OFF state set ext.autoOn = false (or pass { on: false } to launch()).
    autoOn: opts.on !== false,
    onTabIds: new Set(),
    async close() {
      await Promise.race([ctx.close().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    },
  };
  installAutoOn(ext);
  return ext;
}

const isContentUrl = (ext, url) =>
  /^https?:/i.test(url) || url.startsWith(`chrome-extension://${ext.extId}/vendor/pdfjs/web/viewer.html`);

function installAutoOn(ext) {
  const ctx = ext.ctx;
  const origNewPage = ctx.newPage.bind(ctx);
  ext.rawNewPage = origNewPage;
  ctx.newPage = async (...a) => {
    const p = await origNewPage(...a);
    const origGoto = p.goto.bind(p);
    p.goto = async (url, o) => {
      const r = await origGoto(url, o);
      // A .pdf URL is redirected to the bundled viewer shortly after goto() resolves; wait so the
      // tab can be matched by its final URL.
      if (/^https?:[^?#]*\.pdf(?:[?#]|$)/i.test(p.url())) await waitFor(() => p.url().includes("/vendor/pdfjs/web/viewer.html"), { timeout: 5000, interval: 100 });
      if (ext.autoOn && !p.__huemarkOn && isContentUrl(ext, p.url())) {
        p.__huemarkOn = true;
        try { await setTabOn(ext, p, true); } catch (_) {}
      }
      return r;
    };
    return p;
  };
}

// Runs fn(arg) inside a throwaway extension page (chrome.* available) and returns its result.
async function extEval(ext, fn, arg) {
  const page = await (ext.rawNewPage || ext.ctx.newPage.bind(ext.ctx))();
  try {
    await page.goto(ext.popupUrl);
    return await page.evaluate(fn, arg);
  } finally {
    await page.close();
  }
}

// Chrome tab id of a Playwright page (matched by URL; prefers a tab we have not switched on yet).
async function tabIdOf(ext, page) {
  const url = page.url();
  const u = new URL(url);
  // Extension pages (the PDF viewer) have chrome.tabs themselves, and their URLs are hidden from other
  // pages and unusable in match patterns: ask the page.
  if (u.protocol === "chrome-extension:") return page.evaluate(async () => (await chrome.tabs.getCurrent()).id);
  const pattern = `${u.protocol}//${u.hostname}/*`;
  const tabs = await extEval(ext, async (pat) => (await chrome.tabs.query(pat ? { url: pat } : {})).map((t) => ({ id: t.id, url: t.url })), pattern);
  let cands = tabs.filter((t) => t.url === url);
  if (!cands.length) cands = tabs;
  if (!cands.length) throw new Error("no tab for " + url);
  const fresh = cands.filter((t) => !ext.onTabIds.has(t.id));
  return (fresh.length ? fresh : cands).sort((a, b) => a.id - b.id).pop().id;
}

// Switches a page's tab on/off via the background message (same path the popup uses). Returns the reply.
async function setTabOn(ext, page, on = true) {
  const tabId = typeof page === "number" ? page : await tabIdOf(ext, page);
  const r = await extEval(ext, (a) => chrome.runtime.sendMessage({ type: "huemark:setTabOn", tabId: a.tabId, on: a.on }), { tabId, on });
  if (on) ext.onTabIds.add(tabId); else ext.onTabIds.delete(tabId);
  return { tabId, reply: r };
}

async function getTabOn(ext, page) {
  const tabId = typeof page === "number" ? page : await tabIdOf(ext, page);
  const r = await extEval(ext, (id) => chrome.runtime.sendMessage({ type: "huemark:getTabOn", tabId: id }), tabId);
  return !!(r && r.on);
}

// Storage writes go through an extension page (a stopped service worker makes
// ctx.serviceWorkers()[0] a stale handle).
async function setStorage(ext, obj) {
  const page = await ext.ctx.newPage();
  await page.goto(ext.popupUrl);
  await page.evaluate((o) => chrome.storage.local.set(o), obj);
  await page.close();
}

async function getStorage(ext, keys) {
  const page = await ext.ctx.newPage();
  await page.goto(ext.popupUrl);
  const out = await page.evaluate((k) => chrome.storage.local.get(k), keys);
  await page.close();
  return out;
}

const COLORS = ["#ffd54f", "#81d4fa", "#a5d6a7", "#f48fb1", "#ce93d8", "#ffab91"];
const mkTerms = (...names) => names.map((term, i) => ({ term, color: COLORS[i % COLORS.length] }));

// Minimal text PDF (Helvetica). pages: array of arrays of lines. Returns a Buffer.
function makePdf(pages) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // Pages, filled below
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = [];
  for (const lines of pages) {
    const stream = "BT /F1 14 Tf 60 740 Td 20 TL " +
      lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ") + " ET";
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// ---- page probes ----------------------------------------------------------
// Count of highlight marks for a term (case-insensitive), searching the top
// document only. Pass frame to probe another frame.
function markCount(pageOrFrame, term) {
  return pageOrFrame.evaluate((t) => {
    const all = document.querySelectorAll("mark.huemark-highlight");
    if (!t) return all.length;
    return [...all].filter((m) => (m.getAttribute("data-huemark-term") || "").toLowerCase() === t.toLowerCase()).length;
  }, term);
}

// Marks plus CSS-highlight ranges (engine-agnostic "is anything highlighted").
function anyHighlights(pageOrFrame) {
  return pageOrFrame.evaluate(() => {
    const marks = document.querySelectorAll("mark.huemark-highlight").length;
    let ranges = 0;
    if (window.CSS && CSS.highlights) {
      for (const [name, h] of CSS.highlights) if (name.startsWith("huemark-t")) ranges += h.size;
    }
    return marks + ranges;
  });
}

module.exports = {
  EXT_PATH, createRunner, waitFor, startServer, launch, setStorage, getStorage,
  mkTerms, markCount, anyHighlights, makePdf, extEval, tabIdOf, setTabOn, getTabOn,
};
