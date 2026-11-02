setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Popup UI driven like a user: typing terms, options, saved lists, clear-all, palette.
// The popup is opened as a tab (extension page), so it can't read the other tab's counts;
// highlights on the fixture page are checked instead.
const { createRunner, waitFor, startServer, launch, setStorage, getStorage, mkTerms, markCount, anyHighlights } = require("./lib");

const PAGE = `<!doctype html><html><body><p>alpha beta gamma delta epsilon zeta. alpha again. Alphabet.</p></body></html>`;

(async () => {
  const t = createRunner("03-popup-lists");
  const srv = await startServer({ "/p": PAGE });
  const ext = await launch();
  try {
    const page = await ext.ctx.newPage();
    await page.goto(srv.url("/p"));
    const popup = await ext.ctx.newPage();
    await popup.goto(ext.popupUrl);

    const boxes = () => popup.$$(".term-box");
    const typeTerm = async (index, text) => {
      await popup.locator(".term-box").nth(index).locator("input[type=text]").fill(text);
    };

    await t.check("popup loads with exactly one empty term box", async () => (await boxes()).length === 1);

    await typeTerm(0, "alpha");
    await t.check("typing a term highlights it on the page (debounced save)", async () =>
      (await waitFor(async () => (await markCount(page, "alpha")) === 3)));
    await t.check("a new empty box appears only after pressing +", async () => {
      await popup.locator(".add-btn").first().click();
      return (await boxes()).length === 2;
    });
    await typeTerm(1, "beta");
    await t.check("second term highlights with a different color", async () => {
      await waitFor(() => markCount(page, "beta"));
      const cols = await page.evaluate(() => {
        const bg = (t) => document.querySelector(`mark[data-huemark-term="${t}"]`)?.style.backgroundColor;
        return [bg("alpha"), bg("beta")];
      });
      return cols[0] && cols[1] && cols[0] !== cols[1];
    });

    // whole word + colorblind toggles
    await popup.locator("#wholeWordToggle").check();
    await t.check("Whole word toggle: 'alpha' drops Alphabet (3 -> 2)", async () =>
      (await waitFor(async () => (await markCount(page, "alpha")) === 2)));
    const colorOf = () => page.evaluate(() => document.querySelector('mark[data-huemark-term="alpha"]')?.style.backgroundColor);
    const before = await colorOf();
    await popup.locator("#colorblindToggle").check();
    await t.check("Colorblind palette recolors existing terms on the page", async () =>
      (await waitFor(async () => { const now = await colorOf(); return now && now !== before; })));
    await t.check("stored colors are now Okabe-Ito (#E69F00 first)", async () => {
      const { huemark_terms } = await getStorage(ext, ["huemark_terms"]);
      return huemark_terms[0].color.toLowerCase() === "#e69f00";
    });
    await popup.locator("#colorblindToggle").uncheck();

    // saved lists
    await popup.locator("#listSaveBtn").click();
    await t.check("Save shows the name row", async () => await popup.locator("#listNameRow").isVisible());
    await popup.locator("#listNameInput").fill("Greek");
    await popup.locator("#listNameInput").press("Enter");
    await t.check("saved list appears in the dropdown as 'Greek (2)'", async () =>
      (await popup.locator("#listSelect option").allTextContents()).some((s) => s.startsWith("Greek (2)")));
    await t.check("list persisted to storage.local", async () => {
      const { huemark_lists } = await getStorage(ext, ["huemark_lists"]);
      return huemark_lists?.length === 1 && huemark_lists[0].terms.length === 2;
    });

    // dirty dot: edit a term after saving
    await typeTerm(1, "gamma");
    await t.check("editing after save marks the list modified (•)", async () =>
      (await waitFor(async () => (await popup.locator("#listSelect option:checked").textContent()).includes("•"))));

    // overwrite same name (case-insensitive) does not create a second list
    await popup.locator("#listSaveBtn").click();
    await popup.locator("#listNameInput").fill("greek");
    await popup.locator("#listNameInput").press("Enter");
    await t.check("saving the same name overwrites (still 1 list, no dot)", async () => {
      const { huemark_lists } = await getStorage(ext, ["huemark_lists"]);
      const sel = await popup.locator("#listSelect option:checked").textContent();
      return huemark_lists.length === 1 && huemark_lists[0].terms[1].term === "gamma" && !sel.includes("•");
    });

    // clear all, then load the list back
    await popup.locator("#clearAllBtn").click();
    await t.check("Clear all removes every highlight", async () =>
      (await waitFor(async () => (await anyHighlights(page)) === 0)));
    await popup.locator("#listSelect").selectOption({ label: (await popup.locator("#listSelect option").allTextContents())[1] });
    await t.check("loading the list restores terms and highlights", async () =>
      (await waitFor(async () => (await markCount(page, "alpha")) >= 2 && (await markCount(page, "gamma")) === 1)));

    // two-click delete
    await popup.locator("#listDeleteBtn").click();
    await t.check("first Delete click only asks for confirmation (list still there)", async () => {
      const { huemark_lists } = await getStorage(ext, ["huemark_lists"]);
      return huemark_lists.length === 1 && (await popup.locator("#listDeleteBtn").getAttribute("class")).includes("confirming");
    });
    await popup.locator("#listDeleteBtn").click();
    await t.check("second click deletes the list but keeps the terms on screen", async () => {
      const { huemark_lists } = await getStorage(ext, ["huemark_lists"]);
      return huemark_lists.length === 0 && (await markCount(page, "alpha")) >= 2;
    });

    // 10-list cap
    await t.check("11th distinct list is refused (cap = 10), overwrite still allowed", async () => {
      for (let i = 1; i <= 10; i++) {
        await popup.locator("#listSaveBtn").click();
        await popup.locator("#listNameInput").fill(`L${i}`);
        await popup.locator("#listNameInput").press("Enter");
      }
      await popup.locator("#listSaveBtn").click();
      await popup.locator("#listNameInput").fill("L11");
      await popup.locator("#listNameInput").press("Enter");
      let { huemark_lists } = await getStorage(ext, ["huemark_lists"]);
      const capped = huemark_lists.length === 10 && !(await popup.locator("#listNameRow").evaluate((e) => e.hidden));
      await popup.locator("#listNameInput").fill("L3");
      await popup.locator("#listNameInput").press("Enter");
      ({ huemark_lists } = await getStorage(ext, ["huemark_lists"]));
      return capped && huemark_lists.length === 10;
    });

    // reopen popup: state survives
    await popup.reload();
    await t.check("reopened popup shows saved terms and lists", async () => {
      const vals = await popup.$$eval(".term-box input[type=text]", (els) => els.map((e) => e.value).filter(Boolean));
      return vals.includes("alpha") && (await popup.locator("#listSelect option").count()) === 11;
    });

    // duplicate terms
    await setStorage(ext, { huemark_terms: mkTerms("alpha", "ALPHA") });
    await t.check("duplicate (case-variant) terms don't lose highlights", async () =>
      (await waitFor(async () => (await markCount(page, "alpha")) >= 2)));

    // RTL (best-effort: --lang may not switch extension i18n in this build)
    await popup.close();
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
