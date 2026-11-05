setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// RTL layout: Arabic UI locale gives dir=rtl on the popup (via @@bidi_dir). Skips cleanly if
// headless Chromium does not switch the extension's i18n locale (then it stays manual B8).
const { createRunner, launch } = require("./lib");

(async () => {
  const t = createRunner("07-rtl");
  const ext = await launch({ locale: "ar", args: ["--lang=ar"] });
  try {
    const popup = await ext.ctx.newPage();
    await popup.goto(ext.popupUrl);
    await popup.locator("#advancedSection > summary").click(); // #exportBtn lives in the Advanced accordion
    const info = await popup.evaluate(() => ({
      dir: document.documentElement.dir,
      ui: chrome.i18n.getUILanguage(),
      title: document.title,
    }));
    console.log("info:", JSON.stringify(info));
    if (!info.ui.startsWith("ar")) {
      console.log("SKIP  extension UI locale did not switch to ar in this Chromium; keep B8 manual");
      await ext.close();
      process.exit(0);
    }
    await t.check("popup has dir=rtl", async () => info.dir === "rtl");
    await t.check("popup strings are Arabic", async () => /[؀-ۿ]/.test(await popup.locator("#exportBtn").innerText()));
    await t.check("body direction computes to rtl", async () => (await popup.evaluate(() => getComputedStyle(document.body).direction)) === "rtl");
  } finally {
    await ext.close().catch(() => {});
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
