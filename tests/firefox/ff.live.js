setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Real Firefox + real temporary add-on, driven by selenium-webdriver (Playwright's Firefox
// cannot sideload extensions). Run:  MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 node tests/firefox/ff.live.js
// (the env var lets us open moz-extension:// tabs through the chrome context; the runner sets it).
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = "1";
const path = require("path");
const { Builder, By } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const { createRunner, waitFor, startServer, makePdf, mkTerms } = require("../live/lib");

const EXT = path.resolve(__dirname, "..", "..");
const UUID = "5f1b0c52-3a77-4c1e-9f0a-2b6f2a9d7c11";
const POPUP = `moz-extension://${UUID}/src/popup.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRAMES = (srv) => `<!doctype html><html><head><meta charset="utf-8"><title>frames</title></head><body>
<p>top: needle one</p>
<iframe id="same" src="/inner" width="300" height="100"></iframe>
<iframe id="cross" src="${srv.crossUrl("/inner")}" width="300" height="100"></iframe>
<iframe id="srcdoc" srcdoc="<p>srcdoc needle</p>" width="300" height="60"></iframe>
<div id="openhost"></div>
<div id="closedhost"></div>
<script>
  document.getElementById("openhost").attachShadow({ mode: "open" }).innerHTML = "<p>open shadow needle</p>";
  window.__closed = document.getElementById("closedhost").attachShadow({ mode: "closed" });
  window.__closed.innerHTML = "<p>closed shadow needle</p>";
</script></body></html>`;
const INNER = `<!doctype html><html><body><p>inner frame needle needle</p></body></html>`;
const LISTS = `<!doctype html><html><body><p>alpha beta gamma delta. alpha again. Alphabet.</p></body></html>`;

const WEB = `<!doctype html><html><head><meta charset="utf-8"><title>FF</title></head><body>
<p id="a">The cat sat. The cat and the dog slept together. A dog barked.</p>
<p id="b">Only a cat here.</p></body></html>`;

async function openExtTab(d, url) {
  await d.setContext(firefox.Context.CHROME);
  await d.executeScript(`const t = gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()}); gBrowser.selectedTab = t;`, url);
  await d.setContext(firefox.Context.CONTENT);
  await sleep(800);
  const hs = await d.getAllWindowHandles();
  await d.switchTo().window(hs[hs.length - 1]);
  return hs[hs.length - 1];
}

(async () => {
  const t = createRunner("firefox");
  const pages = {};
  const srv = await startServer(pages);
  pages["/w"] = WEB;
  pages["/frames"] = FRAMES(srv);
  pages["/inner"] = INNER;
  pages["/lists"] = LISTS;
  pages["/doc.pdf"] = { type: "application/pdf", body: makePdf([
    ["Page one talks about the heron and the egret.", "A second line with no hit."],
    ["Page two: egret again, and a Heron."],
  ]) };
  const opts = new firefox.Options();
  if (process.env.FIREFOX_BIN) opts.setBinary(process.env.FIREFOX_BIN);
  else opts.setBinary("C:/Program Files/Mozilla Firefox/firefox.exe");
  if (!process.env.HEADED) opts.addArguments("-headless");
  opts.setPreference("extensions.webextensions.uuids", JSON.stringify({ "huemark@fnawaz.dev": UUID }));
  const d = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).build();
  const run = (fn, ...a) => d.executeScript(fn, ...a);
  const runAsync = (src, ...a) => d.executeAsyncScript(`const done = arguments[arguments.length-1]; const args = [...arguments].slice(0,-1); (async()=>{ ${src} })().then(done, e => done({__err:String(e)}));`, ...a);
  try {
    await d.installAddon(EXT, true);
    await sleep(2500);
    const site = await d.getWindowHandle();
    const popup = await openExtTab(d, POPUP);
    await t.check("add-on loads; popup has chrome/browser APIs", async () =>
      (await run("return !!(chrome.storage && browser.storage)")) === true);

    await t.check("popup strings localized (Format presets present)", async () => {
      const txt = await run("return [...document.querySelectorAll('#exportPreset option')].map(o=>o.textContent.trim())");
      return ["Matches", "Citation", "Research", "Resume"].every((x) => txt.includes(x));
    });
    await t.check("saved-lists placeholder localized", async () =>
      /Saved lists/.test(await run("return document.body.textContent")));

    // seed terms
    await runAsync(`await browser.storage.local.set({huemark_terms: args[0], huemark_options: {enabled:true, wholeWord:false}}); return 1;`, mkTerms("cat", "dog"));

    // Every tab starts OFF (per-tab switch). Switch the content tab on/off through the background,
    // from the popup tab (same message the popup toggle sends). Tab ids persist across navigation.
    const tabOn = async (on, urlPart) => {
      const cur = await d.getWindowHandle();
      await d.switchTo().window(popup);
      await runAsync(`
        const self = (await browser.tabs.getCurrent()).id;
        const tabs = (await browser.tabs.query({})).filter(t => t.id !== self && (args[1] ? (t.url || '').includes(args[1]) : /^http:/.test(t.url || '')));
        for (const tab of tabs) await browser.runtime.sendMessage({type:'huemark:setTabOn', tabId: tab.id, on: args[0]});
        return tabs.length;`, on, urlPart || null);
      await d.switchTo().window(cur);
    };

    // content tab
    await d.switchTo().newWindow("tab");
    const page = await d.getWindowHandle();
    await d.get(srv.url("/w"));
    await tabOn(true);
    const marks = async () => run("return document.querySelectorAll('mark.huemark-highlight').length + ([...(CSS.highlights||[])].filter(([n])=>n.startsWith('huemark-t')).reduce((a,[,h])=>a+h.size,0))");
    await t.check("core: terms are highlighted on a web page", async () => (await waitFor(async () => (await marks()) >= 5, { timeout: 8000 })) === true);

    await t.check("export: collect from content tab yields cat/dog matches", async () => {
      await d.switchTo().window(popup);
      // Keep the fixture tab selected while collecting (a real popup overlays the active tab).
      await d.setContext(firefox.Context.CHROME);
      await run(`const tab = gBrowser.tabs.find(t => t.linkedBrowser.currentURI.spec.startsWith('http://127.0.0.1')); gBrowser.selectedTab = tab;`);
      await d.setContext(firefox.Context.CONTENT);
      const data = await runAsync(`
        await browser.storage.session.remove('huemark_export');
        const tabs = await browser.tabs.query({url: 'http://*/*'});
        for (const tab of tabs) { try { const r = await browser.tabs.sendMessage(tab.id, {type:'huemark:export', names:['cat','dog']}, {frameId:0}); if (r!==undefined && r!==null) break; } catch(e){} }
        for (let i=0;i<100;i++){ const x=(await browser.storage.session.get('huemark_export')).huemark_export; if (x && x.state!=='running') return x; await new Promise(r=>setTimeout(r,300)); }
        return null;`);
      if (process.env.DEBUG_FF) {
        console.log("collect:", JSON.stringify(data).slice(0, 400));
        console.log("tabs:", JSON.stringify(await runAsync(`return (await browser.tabs.query({})).map(t=>[t.id,t.url,t.active])`)));
        await d.switchTo().window(page);
        console.log("page marks:", await marks());
        await d.switchTo().window(popup);
      }
      globalThis.__data = data && data.data;
      return data && data.state === "ready";
    });

    const render = (opts) => runAsync(`
      const m = (k) => chrome.i18n.getMessage(k) || '';
      const labels = { title: m('exportMdTitle'), source: m('exportMdSource'), exported: m('exportMdExported'), terms: m('exportMdTerms'),
        matches: m('exportMdMatches'), page: m('exportMdPage'), line: m('exportMdLine'), scanned: m('exportMdScanned'),
        unreadable: m('exportMdUnreadable'), none: m('exportMdNoMatches'), more: m('exportMdMore'), passages: m('exportMdPassages') };
      return window.__huemarkExport.toMarkdown(args[0], ['cat','dog'], labels, args[1]);`, globalThis.__data, opts);

    await t.check("export: snippet markdown mentions both terms", async () => {
      const md = await render({ mode: "snippet", club: true });
      return typeof md === "string" && /cat/i.test(md) && /dog/i.test(md);
    });
    await t.check("export: sentence mode clubs 'cat + dog'", async () =>
      /cat \+ dog/.test(await render({ mode: "sentence", club: true })));
    await t.check("export: paragraph mode runs", async () =>
      typeof (await render({ mode: "paragraph", club: false })) === "string");

    await t.check("popup: Format presets switch Style/controls visibility", async () => {
      await run("const s=document.getElementById('exportPreset'); s.value='citation'; s.dispatchEvent(new Event('change',{bubbles:true}));");
      await sleep(200);
      return await run("const e=document.getElementById('exportStyle'); return !!e && e.offsetParent!==null");
    });

    await t.check("power switch: disabling removes highlights", async () => {
      await tabOn(false);
      await d.switchTo().window(page);
      return (await waitFor(async () => (await marks()) === 0, { timeout: 8000 })) === true;
    });
    await t.check("power switch: re-enabling restores highlights", async () => {
      await tabOn(true);
      await d.switchTo().window(page);
      return (await waitFor(async () => (await marks()) >= 5, { timeout: 8000 })) === true;
    });

    // ---------- shared helpers for the new sections ----------
    const setLocal = async (obj) => {
      await d.switchTo().window(popup);
      await runAsync(`await browser.storage.local.set(args[0]); return 1;`, obj);
    };
    const getLocal = async (keys) => {
      await d.switchTo().window(popup);
      return runAsync(`return await browser.storage.local.get(args[0]);`, keys);
    };
    const selectTab = async (urlPart) => {
      await d.setContext(firefox.Context.CHROME);
      await run(`const tab = gBrowser.tabs.find(t => t.linkedBrowser.currentURI.spec.includes(arguments[0])); if (tab) gBrowser.selectedTab = tab;`, urlPart);
      await d.setContext(firefox.Context.CONTENT);
    };
    const inFrame = async (sel, fn) => {
      await d.switchTo().defaultContent();
      const el = await d.findElement(By.css(sel));
      await d.switchTo().frame(el);
      try { return await fn(); } finally { await d.switchTo().defaultContent(); }
    };

    // ---------- frames + shadow roots (ports of suite 02) ----------
    await setLocal({ huemark_terms: mkTerms("needle"), huemark_options: { enabled: true, wholeWord: false } });
    await d.switchTo().window(page);
    await d.get(srv.url("/frames"));
    await sleep(2500); // let child frames finish
    const topMarks = () => run("return document.querySelectorAll('mark.huemark-highlight').length");
    await t.check("frames: top document highlighted", async () =>
      (await waitFor(async () => (await marks()) >= 1, { timeout: 8000 })) === true);
    await t.check("frames: same-origin iframe highlighted (2 matches)", async () =>
      await waitFor(async () => (await inFrame("#same", marks)) === 2, { timeout: 8000 }));
    await t.check("frames: cross-origin iframe highlighted (2 matches)", async () =>
      await waitFor(async () => (await inFrame("#cross", marks)) === 2, { timeout: 8000 }));
    await t.check("frames: srcdoc iframe highlighted", async () =>
      await waitFor(async () => (await inFrame("#srcdoc", marks)) === 1, { timeout: 8000 }));
    await t.check("frames: open shadow root highlighted", async () =>
      await waitFor(async () => run(`const r = document.getElementById('openhost').shadowRoot; return !!r && r.querySelectorAll('mark.huemark-highlight').length === 1 || [...(CSS.highlights||[])].some(([n])=>n.startsWith('huemark-t'));`), { timeout: 8000 }));
    // The closed root is unreachable from page script; the getCounts total below (which includes it) is the proof.
    await t.check("frames: iframe added after load gets highlighted", async () => {
      await run(`const f = document.createElement('iframe'); f.id = 'late'; f.srcdoc = '<p>late needle</p>'; document.body.prepend(f);`);
      return await waitFor(async () => (await inFrame("#late", marks)) === 1, { timeout: 8000 });
    });
    await t.check("frames: aggregated getCounts across frames + shadow = 9", async () => {
      await d.switchTo().window(popup);
      await selectTab("/frames");
      const counts = await waitFor(() => runAsync(`
        const self = (await browser.tabs.getCurrent()).id;
        const tabs = await browser.tabs.query({url: 'http://*/*'});
        for (const tab of tabs) { if (tab.id === self) continue;
          try { const r = await browser.tabs.sendMessage(tab.id, {type:'huemark:getCounts', terms:['needle']}, {frameId:0}); if (r && r.needle && r.needle.count) return r.needle; } catch(e){} }
        return null;`), { timeout: 8000 });
      // top 1 + same 2 + cross 2 + srcdoc 1 + open 1 + closed 1 + late 1 = 9
      return counts && counts.count === 9;
    });
    await tabOn(false);
    await t.check("frames: Tab off clears top + same + cross-origin frames", async () => {
      await d.switchTo().window(page);
      return await waitFor(async () => (await marks()) === 0 && (await inFrame("#same", marks)) === 0 && (await inFrame("#cross", marks)) === 0, { timeout: 8000 });
    });

    // ---------- saved lists via the popup UI (port of suite 03) ----------
    await setLocal({ huemark_terms: [], huemark_lists: [], huemark_active_list: null, huemark_options: { enabled: true, wholeWord: false } });
    await d.switchTo().window(page);
    await d.get(srv.url("/lists"));
    await tabOn(true);
    const markCountOf = (term) => run(`return [...document.querySelectorAll('mark.huemark-highlight')].filter(m => (m.getAttribute('data-huemark-term')||'').toLowerCase() === arguments[0]).length + ([...(CSS.highlights||[])].filter(([n]) => n.startsWith('huemark-t')).length ? -1 : 0)`, term);
    await d.switchTo().window(popup);
    await d.navigate().refresh();
    await sleep(800);
    const clickEl = (css) => run(`document.querySelector(arguments[0]).click()`, css);
    const typeIn = async (index, text) => {
      const boxes = await d.findElements(By.css(".term-box input[type=text]"));
      await boxes[index].clear();
      await boxes[index].sendKeys(text);
    };
    await typeIn(0, "alpha");
    await t.check("lists: typing a term highlights it on the page", async () => {
      return await waitFor(async () => { await d.switchTo().window(page); const n = await marks(); await d.switchTo().window(popup); return n === 3; }, { timeout: 8000 });
    });
    await clickEl(".add-btn");
    await typeIn(1, "beta");
    await clickEl("#listSaveBtn");
    await t.check("lists: Save shows the name row", async () =>
      await run("const r = document.getElementById('listNameRow'); return !!r && !r.hidden && r.offsetParent !== null"));
    const name = await d.findElement(By.css("#listNameInput"));
    await name.clear();
    await name.sendKeys("Greek");
    await clickEl("#listNameOk");
    await sleep(300);
    await t.check("lists: saved list appears as 'Greek (2)' and persists to storage", async () => {
      const opts = await run("return [...document.querySelectorAll('#listSelect option')].map(o => o.textContent)");
      const { huemark_lists } = await getLocal(["huemark_lists"]);
      return opts.some((s) => s.startsWith("Greek (2)")) && huemark_lists && huemark_lists.length === 1 && huemark_lists[0].terms.length === 2;
    });
    await typeIn(1, "gamma");
    await t.check("lists: editing after save marks the list modified (•)", async () =>
      await waitFor(() => run("const o = document.querySelector('#listSelect option:checked'); return !!o && o.textContent.includes('•')"), { timeout: 5000 }));
    await clickEl("#clearAllBtn");
    await t.check("lists: Clear all removes every highlight", async () =>
      await waitFor(async () => { await d.switchTo().window(page); const n = await marks(); await d.switchTo().window(popup); return n === 0; }, { timeout: 8000 }));
    await run(`const s = document.getElementById('listSelect'); s.selectedIndex = 1; s.dispatchEvent(new Event('change', {bubbles: true}));`);
    await t.check("lists: loading the list restores terms and highlights", async () =>
      await waitFor(async () => { await d.switchTo().window(page); const n = await marks(); await d.switchTo().window(popup); return n >= 2; }, { timeout: 8000 }));
    await clickEl("#listDeleteBtn");
    await t.check("lists: first Delete click only asks for confirmation", async () => {
      const { huemark_lists } = await getLocal(["huemark_lists"]);
      return huemark_lists.length === 1 && (await run("return document.getElementById('listDeleteBtn').className")).includes("confirming");
    });
    await clickEl("#listDeleteBtn");
    await t.check("lists: second click deletes the list", async () => {
      await sleep(300);
      const { huemark_lists } = await getLocal(["huemark_lists"]);
      return huemark_lists.length === 0;
    });

    // ---------- PDF (port of suite 04) ----------
    await setLocal({ huemark_terms: mkTerms("heron", "egret"), huemark_options: { enabled: true, wholeWord: false } });
    await d.switchTo().window(page);
    await d.get(srv.url("/doc.pdf"));
    const pdfMarks = () => run("return document.querySelectorAll('#viewer .textLayer mark.huemark-highlight').length");
    await t.check("pdf: URL is redirected to the bundled viewer", async () =>
      await waitFor(async () => (await d.getCurrentUrl()).includes("/vendor/pdfjs/web/viewer.html"), { timeout: 10000 }));
    await t.check("pdf: text layer gets 4 highlights (heron x2 + egret x2)", async () => {
      await waitFor(async () => (await pdfMarks()) >= 4, { timeout: 15000 });
      return (await pdfMarks()) === 4;
    });
    let pdfData = null;
    await t.check("pdf: export ready, 4 rows with page numbers on pages 1 and 2", async () => {
      await d.switchTo().window(popup);
      await selectTab("viewer.html");
      const res = await runAsync(`
        await browser.storage.session.remove('huemark_export');
        const self = (await browser.tabs.getCurrent()).id;
        const tabs = (await browser.tabs.query({})).filter(t => t.id !== self && (t.url || '').includes('viewer.html'));
        for (const tab of tabs) {
          try { const r = await browser.tabs.sendMessage(tab.id, {type:'huemark:export', names:['heron','egret']}, {frameId:0}); if (r && r.started) break; } catch(e){} }
        for (let i=0;i<150;i++){ const x=(await browser.storage.session.get('huemark_export')).huemark_export; if (x && x.state!=='running') return x; await new Promise(r=>setTimeout(r,300)); }
        return null;`);
      pdfData = res && res.data;
      if (process.env.DEBUG_FF) console.log("pdf export:", JSON.stringify(res).slice(0, 600));
      if (!res || res.state !== "ready") return false;
      const rows = res.data.rows;
      const pgs = new Set(rows.map((r) => r.page));
      return rows.length === 4 && rows.every((r) => Number.isInteger(r.page)) && pgs.has(1) && pgs.has(2);
    });
    await t.check("pdf: page restored to 1 after export", async () => {
      await d.switchTo().window(page);
      return (await run("const e = document.getElementById('pageNumber'); return e ? Number(e.value) : null")) === 1;
    });
    await t.check("pdf: markdown cites pages", async () => {
      await d.switchTo().window(popup);
      globalThis.__data = pdfData;
      const md = await runAsync(`
        const m = (k) => chrome.i18n.getMessage(k) || '';
        const labels = { title: m('exportMdTitle'), source: m('exportMdSource'), exported: m('exportMdExported'), terms: m('exportMdTerms'),
          matches: m('exportMdMatches'), page: m('exportMdPage'), line: m('exportMdLine'), scanned: m('exportMdScanned'),
          unreadable: m('exportMdUnreadable'), none: m('exportMdNoMatches'), more: m('exportMdMore'), passages: m('exportMdPassages') };
        return window.__huemarkExport.toMarkdown(args[0], ['heron','egret'], labels);`, pdfData);
      return /p\.\s?1/.test(md || "") && /p\.\s?2/.test(md || "");
    });
  } catch (e) {
    console.log("HARNESS ERROR", e && e.message);
    process.exitCode = 1;
  }
  const ok = t.summary();
  try { await d.quit(); } catch (_) {}
  await srv.close();
  process.exit(ok && !process.exitCode ? 0 : 1);
})();
