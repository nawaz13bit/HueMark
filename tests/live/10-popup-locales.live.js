// Popup under every one of the 13 UI locales: each data-i18n element shows its translated
// message (not English), nothing overflows horizontally (long de/ru/fr strings), RTL for ar.
// Screenshots (help sections opened) go to tests/live/shots/ (gitignored) for a visual look.
const fs = require("fs");
const path = require("path");
const { createRunner, launch, EXT_PATH } = require("./lib");

const LOCALES = ["ar", "de", "es", "fr", "hi", "it", "ja", "ko", "pt_BR", "ru", "zh_CN", "zh_TW"];
const LANG = { pt_BR: "pt-BR", zh_CN: "zh-CN", zh_TW: "zh-TW" };
const SHOTS = path.join(__dirname, "shots");
const readMsgs = (l) => JSON.parse(fs.readFileSync(path.join(EXT_PATH, "_locales", l, "messages.json"), "utf8"));

(async () => {
  const t = createRunner("10-popup-locales");
  fs.mkdirSync(SHOTS, { recursive: true });
  const en = readMsgs("en");

  for (const loc of LOCALES) {
    const msgs = readMsgs(loc);
    const lang = LANG[loc] || loc;
    const e = await launch({ locale: lang, args: [`--lang=${lang}`] });
    try {
      const p = await e.ctx.newPage();
      await p.setViewportSize({ width: 360, height: 900 });
      await p.goto(e.popupUrl);
      await p.waitForTimeout(400);
      await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));

      const info = await p.evaluate(() => {
        const out = { items: [], overflow: [], dir: document.documentElement.dir, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
        document.querySelectorAll("[data-i18n]").forEach((el) => {
          const attr = el.getAttribute("data-i18n-attr");
          const shown = attr ? el.getAttribute(attr) : el.textContent.trim();
          out.items.push({ key: el.getAttribute("data-i18n"), shown });
        });
        // Clipped text: a visible element whose content is wider than its box and clips it.
        document.querySelectorAll("button, label, span, summary, option, p, select").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || el.closest("[hidden]")) return;
          const cs = getComputedStyle(el);
          if (cs.display === "none") return;
          if (el.scrollWidth > el.clientWidth + 2 && ["hidden", "clip"].includes(cs.overflowX)) out.overflow.push((el.textContent || "").trim().slice(0, 40));
        });
        return out;
      });

      // 1) every tagged element shows its locale's message (applied, not left as the English default)
      await t.check(`${loc}: every data-i18n element shows the ${loc} message`, async () => {
        const bad = info.items.filter((i) => msgs[i.key] && i.shown !== msgs[i.key].message.replace(/\s+/g, " ") && i.shown.replace(/\s+/g, " ") !== msgs[i.key].message.replace(/\s+/g, " "));
        if (bad.length) console.log("   mismatch:", bad.slice(0, 5).map((b) => b.key).join(", "));
        return info.items.length > 20 && bad.length === 0;
      });
      // 2) no English left: a translated message identical to English is only OK for brand/proper names
      await t.check(`${loc}: no untranslated English strings`, async () => {
        // Genuine cognates: the native word is spelled like the English one.
        const COGNATES = { de: ["popupExportPreset"], fr: ["popupExportPreset", "exportPresetCitation", "popupExportStyle"] };
        const ok = new Set(COGNATES[loc] || []);
        const same = info.items.filter((i) => !ok.has(i.key) && en[i.key] && msgs[i.key] && msgs[i.key].message === en[i.key].message && /[A-Za-z]{4,}/.test(en[i.key].message));
        if (same.length) console.log("   same as English:", same.map((s) => s.key).join(", "));
        return same.length === 0;
      });
      // 3) layout
      await t.check(`${loc}: no horizontal page overflow or clipped text`, async () => {
        if (info.pageOverflow || info.overflow.length) console.log("   overflow:", info.pageOverflow, info.overflow.slice(0, 5).join(" | "));
        return !info.pageOverflow && info.overflow.length === 0;
      });
      if (loc === "ar") await t.check("ar: popup is right-to-left", async () => info.dir === "rtl");
      await p.screenshot({ path: path.join(SHOTS, `popup-${loc}.png`), fullPage: true });
    } finally { await e.close(); }
  }
  process.exit(t.summary() ? 0 : 1);
})();
