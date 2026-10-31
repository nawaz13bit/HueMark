# HueMark live-test task list

Live = real Chromium + the real unpacked extension, driven by Playwright. Last run: 2026-10-27.

## How to run
- All: `node tests/live/run-all.js` — one suite: `node tests/live/01-core.live.js`
- Needs Playwright resolvable from node (found in `C:\Users\fnawa\node_modules`) and Playwright's Chromium (`channel: "chromium"`, headless).
- Debug env vars: `DEBUG_FRAMES=1` (per-frame mark counts in 02).
- Harness gotchas (`lib.js`): wait ~2s after launch (`onInstalled` seeds `huemark_terms: []` and overwrites early writes); do storage writes from an extension page (`chrome-extension://<id>/src/popup.html`); an extension page opened as a tab can't read other tabs' URLs but can `chrome.tabs.query({url})` for http pages; popup.js clears `none`/`failed` export state as soon as it sees it, so check that state from the service worker; use `popup.locator(...)`, not `$$` handles.

## Automated
| Status | Suite | Covers |
|---|---|---|
| 16/16 | `01-core` | matching, whole-word, accent folding (cafe/resume/strasse), wildcard, Enabled off/on, dynamic content, hidden/script/textarea exclusion, bar, reload |
| 13/13* | `02-frames-shadow` | same-origin / cross-origin / srcdoc / about:blank iframes, open + closed shadow roots, cross-frame getCounts (10), next-jumps + scroll, late iframe, disable clears frames |
| 19/19 | `03-popup-lists` | typing terms, + button, colors, whole-word, colorblind palette, save/overwrite/dirty dot, clear all, load, 2-click delete, 10-list cap, reload persistence, duplicate terms |
| 11/11 | `04-export-pdf` | web Markdown export (rows, exclusions, badge, clear), no-match -> `none`, PDF redirect to bundled viewer, text-layer highlights, PDF export with pages, page restored |

| 8/8 | `05-css-engine` | forced engine switch (page replaces marks), `CSS.highlights` ranges, no DOM wrappers, ticks host, `huemark-current` after jump, export in CSS mode, clear removes ranges |
| 15/15 | `06-export-modes` | popup export controls (mode select, club row visibility, "!" + aria-expanded, saved/restored prefs), sentence/paragraph/snippet output, club vs repeat, no "(0)" section, PDF sentence/paragraph via real collect() |

| 3/3 | `07-rtl` | `locale: "ar"` popup gets dir=rtl, Arabic strings |
| 7/7 | `08-power-switch` | popup Enabled switch on/off, floating-bar power button disables globally, hides bar, keeps terms |
| 31/31 | `09-presets-locale` | 13 locales x 88 keys, PDF.js locale folders, Matches/Citation(9 styles, distinct)/Research/Resume output from a real collect(), Format/Style popup controls (Style hidden via computed display for non-Citation), localized Format options (de/fr/es), real-world quirks (labels, footnote markers, PubMed authors), accented authors/titles (Müller, Dvořák, Café) |

| 37/37 | `10-popup-locales` | popup in 12 non-English locales (narrow 360px, help open): every data-i18n element shows its locale message, no leftover English (cognate allowlist de/fr), no horizontal overflow/clipping, ar is RTL; screenshots in `tests/live/shots/` (gitignored) |

Tools (not suites): `cite-real.js` runs the export against a real public URL (`[SHOW_HTML=1] [WAIT_MS=n] [DUMP_META=1] node tests/live/cite-real.js <url> <t1,t2> [mode] [styles]`; "state: null" = no matches or a PDF that was not redirected); `probe-anc.js` prints ancestor chains. `lib.js` `startServer.close` drops open connections (otherwise a keep-alive hangs the suite).
| 11/11 | `tests/firefox/ff.live.js` | real Firefox + temporary add-on (selenium-webdriver): load, localized popup, highlight, export modes via real collect(), preset UI, power switch |

## Cross-browser (2026-10-31)
- All browsers in order: `node tests/run-browsers.js [chromium] [msedge] [firefox]` (default all three).
- `BROWSER=msedge node tests/live/run-all.js` runs the Playwright suites on branded Edge (headed, adds `--disable-features=DisableLoadExtensionCommandLineSwitch`). Default `chromium` stands in for Chrome: branded Chrome 155/156 ignores `--load-extension`.
- Firefox: Playwright's Firefox cannot sideload extensions, so `tests/firefox/ff.live.js` drives real Firefox (`C:\Program Files\Mozilla Firefox`, override with `FIREFOX_BIN`) via selenium-webdriver (`npm install` in `tests/firefox/` first). Pinned UUID via `extensions.webextensions.uuids`; moz-extension tabs are opened from chrome context (`MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`, set by the script) because content navigation to moz-extension:// is blocked. `HEADED=1` shows the window. Firefox has an extra blank tab with a content script, so target `tabs.query({url:'http://*/*'})`.
- Firefox suite is a subset (no frames/PDF/lists yet); extend `ff.live.js` for those.

\* Intermittent: the cross-origin (localhost) iframe is occasionally not highlighted (~1 in 4-6 headless runs; a longer wait doesn't help; not tied to shadow roots or about:blank). Cause unverified: real extension race vs. headless/site-isolation artifact. **Open item: reproduce in real Chrome.**

## Pending work (tick when done; this list is the source of truth, kept in the repo so it survives a context clear)

### A. Automatable next (Claude can do)
- [x] A1 (done 2026-10-30; the page must replace marks with text, not delete them). Write `05-css-engine.live.js`: force the engine switch by removing marks >=5x in 10s from a page script, then assert `CSS.highlights` has `huemark-t*` ranges, `huemark-current` exists after a jump, scrollbar ticks host `huemark-markers-host` is present, and export still works in CSS mode.
- [x] A2 (2026-10-30: 6/6 suites green, then 07-rtl 3/3). Re-run the whole suite (`node tests/live/run-all.js`) after A1; last full run predates the final 02 fix (02 alone: 13/13).
- [x] A3 (done: `07-rtl.live.js`, `locale:"ar"` + `--lang=ar` works headless; popup dir=rtl. Saved-lists row and export layout still need eyes, B8). Best-effort RTL: launch with `locale: "ar"` / `--lang=ar`, check `dir=rtl` on the popup and the saved-lists row (may not switch extension i18n in headless; if not, leave as manual B8).
- [ ] A4 (2026-10-31 update: headless 1/12 failures, headed Chromium 0/6, so likely a headless/site-isolation artifact; still unproven. Original note: 2026-10-30: reproduced headless in 2 of 10 loops of 02, always "cross-origin iframe highlighted (2 matches)" + "getCounts totals = 10"; headed not tried; root cause not yet investigated). Investigate the intermittent cross-origin iframe miss (see Automated section): try headed mode (`launch({headless:false})`) and loop 02 ~10 times to see if it reproduces; if it does, debug content.js frame injection / relay.

### B. Needs a human in a real browser
- [ ] B1. Cross-origin iframe intermittent miss in real, headed Chrome.
- [ ] B2. CSS Highlight engine on real React/Vue/Next pages (auto-switch, current-match underline, scroll centering in inner scrollers and PDF viewer, Chrome + Firefox 140+).
- [ ] B3. Firefox via `web-ext run`: popup, openPopup, storage, iframes/shadow, lists, export, Enabled-off.
- [ ] B4. Real Chrome "Load unpacked" smoke test (Chrome 155 can't auto-load extensions).
- [ ] B5. Export UX: real clipboard paste, badge colour and clearing, closing the tab mid-export.
- [ ] B6. Long multi-page PDF export while switching to another tab/window mid-export (hidden tabs may pause PDF.js rendering).
- [ ] B7. Scanned (image-only) PDF: "scanned" note in export.
- [ ] B8. RTL (`ar`) layout of popup, saved lists row and export.
- [ ] B9. Accent folding / FOLD_MAP (ß, ł, đ, ø, œ, æ, ð, ħ, ŧ, ı) on real es/fr/de/pl/tr/vi/el/ar/he/ru/hi/ja pages; native-speaker sanity.
- [ ] B10. Closed shadow roots on real sites (fixture only covers `openOrClosedShadowRoot`).
- [ ] B11. Right-click "add term" context menu.
- [ ] B13. Export controls by eye: Extract dropdown, club checkbox, "!" explainer layout and wrapping in all 13 locales (non-English strings are unreviewed by natives).
- [ ] B14. PDF paragraph mode on a real multi-paragraph PDF (line-gap guess, >1.65x line height; fixtures only have uniform spacing).
- [x] B15. Resolved 2026-10-31: the all-bold Word paste was leftover formatting in the user's Word document, not the HTML. Copy matches writes plain semantic HTML (h1/h2, ul/li, b, a) + plain text again (verified in Chromium clipboard read-back, 12/12). The .docx button was removed 2026-10-31 (paste-anywhere only). Still to check by eye: paste into LibreOffice, Google Docs, classic Outlook.
- [ ] B12. Enabled off during an in-progress export must not break it; turning it on restores highlights, ticks and badge (Chrome + Firefox).

Related memory: `live-test-suite` and `project-manual-test-queue` (same items, tick them there too when confirmed).
