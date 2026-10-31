// Debug helper: node tests/live/probe-anc.js <url> <term> <textFragment>
// Prints the ancestor chain (tag.class#id) of each text node containing the fragment.
const { launch, setStorage, mkTerms } = require("./lib");
const [url, term, frag] = process.argv.slice(2);
(async () => {
  const ext = await launch();
  try {
    await setStorage(ext, { huemark_terms: mkTerms(term), huemark_options: { enabled: true, wholeWord: true } });
    const page = await ext.ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));
    const out = await page.evaluate((frag) => {
      const res = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n && res.length < 4; n = w.nextNode()) {
        if (!n.nodeValue.includes(frag)) continue;
        const chain = [];
        for (let e = n.parentElement; e && e !== document.body; e = e.parentElement) chain.push(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : ""));
        res.push(chain.join(" < "));
      }
      return res;
    }, frag);
    console.log(out.join("\n\n"));
  } finally { await ext.close(); }
})();
