// Real Firefox + real temporary add-on, driven by selenium-webdriver (Playwright's Firefox
// cannot sideload extensions). Run:  MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 node tests/firefox/ff.live.js
// (the env var lets us open moz-extension:// tabs through the chrome context; the runner sets it).
process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = "1";
const path = require("path");
const { Builder } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const { createRunner, waitFor, startServer, makePdf, mkTerms } = require("../live/lib");

const EXT = path.resolve(__dirname, "..", "..");
const UUID = "5f1b0c52-3a77-4c1e-9f0a-2b6f2a9d7c11";
const POPUP = `moz-extension://${UUID}/src/popup.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const srv = await startServer({ "/w": WEB });
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

    // content tab
    await d.switchTo().newWindow("tab");
    const page = await d.getWindowHandle();
    await d.get(srv.url("/w"));
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
      await runAsync(`await browser.storage.local.set({huemark_options:{enabled:false, wholeWord:false}}); return 1;`);
      await d.switchTo().window(page);
      return (await waitFor(async () => (await marks()) === 0, { timeout: 8000 })) === true;
    });
    await t.check("power switch: re-enabling restores highlights", async () => {
      await d.switchTo().window(popup);
      await runAsync(`await browser.storage.local.set({huemark_options:{enabled:true, wholeWord:false}}); return 1;`);
      await d.switchTo().window(page);
      return (await waitFor(async () => (await marks()) >= 5, { timeout: 8000 })) === true;
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
