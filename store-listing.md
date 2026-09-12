# HueMark — store listing brief

## Short description (Chrome Web Store: ≤132 chars, Edge/AMO similar limits)

Highlight multiple words or phrases in different colors, on any page and in PDFs — with keyboard navigation between matches.

## Full description

HueMark lets you highlight several search terms at once, each in its own
color, so you can visually track multiple threads of information on any
page.

**Highlights everywhere**
- Static pages — highlighted the moment they load.
- Dynamic pages and single-page apps — a live watcher catches new content as
  it streams in (infinite scroll, chat apps, live feeds), so highlights never
  go stale.
- PDFs — both online (http/https) and local PDF files, via a bundled PDF.js
  viewer.

**Stays with you**
- Your term list and colors are saved and re-applied automatically every
  time you revisit a page or reopen the browser.
- A colorblind-friendly palette is one click away in the popup.

**Keyboard-first navigation**
- Jump to the next/previous match and cycle between terms without touching
  the mouse: Alt+Shift+Up / Down / Left / Right (Cmd+Shift+... on Mac).
- A persistent outline marks your current match so you never lose your
  place while scanning a long page.

**Privacy**
- No data collection, no analytics, no external servers. Your search terms
  and colors are stored locally on your device (`chrome.storage.local`) and
  never leave it.

**Good to know**
- Works on any page whose text lives in the real DOM — the vast majority of
  the web.
- Canvas-rendered apps (Google Docs, Google Sheets) can't be highlighted by
  any browser extension, HueMark included — their content is drawn to a
  canvas, not real DOM text.

## Category

Productivity / Accessibility

## Permission justifications (for store review forms)

- **storage** — save the user's term list, colors, and settings so
  highlights persist across sessions and reloads.
- **scripting** — inject the highlighting engine into pages on demand.
- **activeTab** — apply highlights to the page the user is currently
  viewing.
- **declarativeNetRequest** — redirect PDF navigations to the bundled
  PDF.js viewer, since browsers don't allow third-party scripts inside
  their built-in PDF viewers.
- **host permissions (`<all_urls>`)** — HueMark is a general-purpose
  highlighter with no fixed set of target domains: users add their own
  search terms and expect them highlighted automatically on any page or
  PDF they visit, including on page reload and revisit, and as new content
  streams into dynamic pages (infinite scroll, chat apps, SPA navigation)
  via a mutation observer. `activeTab` cannot cover this: it only grants
  access after an explicit per-tab user gesture (e.g. clicking the toolbar
  icon) and that grant does not persist across reloads or navigation, so
  highlights would disappear and require a fresh click on every page load.
  Broad host access is also required for `declarativeNetRequest` to
  redirect PDF navigations to the bundled PDF.js viewer, since PDFs can be
  hosted on any domain.

## Notes for certification (Edge Partner Center, <2000 chars)

HueMark is a multi-color text/keyword highlighter for web pages and PDFs.
No login, no account, no backend — everything runs locally in the
browser.

How to test:
1. Click the toolbar icon to open the popup.
2. Type a word or phrase into the term field and pick a color; add more
   terms with the "+" button, each gets its own color.
3. Matches are highlighted immediately on the current page. Reload the
   page or navigate elsewhere and back — highlights reapply automatically
   from saved state.
4. Open a PDF (e.g. any http(s) link ending in .pdf, or via "Open local
   PDF..." in the popup) — the same terms highlight inside the bundled
   PDF.js viewer.
5. Alt+Shift+Up/Down jumps between matches; Alt+Shift+Left/Right cycles
   which term is active. A floating bar (Alt+Shift+B or the toolbar
   command) offers the same controls without opening the popup.

Why broad host permissions (`<all_urls>`) are requested: HueMark has no
fixed set of target sites — users choose their own search terms and
expect them highlighted on any page or PDF they visit, including after
reload/revisit and as new content streams in on dynamic pages (a
MutationObserver watches for DOM changes). `activeTab` can't support this
because its grant is per-gesture and doesn't survive reload or
navigation, which would break the core "highlights persist" behavior.
Broad host access is also needed for `declarativeNetRequest`, which
redirects PDF navigations (any domain) to the bundled PDF.js viewer,
since browsers block third-party scripts inside their built-in PDF
viewer.

Privacy: no data collection, no analytics, no remote servers. All terms,
colors, and settings are stored locally via `chrome.storage.local` and
never transmitted anywhere. Source is public:
https://github.com/nawaz13bit/HueMark

## Screenshots (in `screenshots/store/`, ready to upload — 1280x800, letterboxed via `scripts/resize-screenshots.ps1`)

- `01-webpage-highlights-popup.png` — Wikipedia article with 6 terms
  highlighted in distinct colors, popup panel open showing the term/color
  list.
- `02-webpage-highlights-nav.png` — same page, keyboard-nav term picker
  open showing per-term match counts and color dots.
- `03-pdf-highlights.png` — a real IRS Form 1040 PDF opened in the bundled
  PDF.js viewer, with multiple terms highlighted directly on form text.
- `04-pdf-highlights-nav.png` — same PDF, nav picker open showing match
  counts per term.
- `promo-tile-440x280.png` — small promo tile (Chrome Web Store), generated
  from the toolbar icon's stripe motif + wordmark.
- `marquee-tile-1400x560.png` — optional marquee promo tile (Chrome Web
  Store, only used if Google features the extension), same motif scaled up.

## Homepage / support URL

https://github.com/nawaz13bit/HueMark

(Public source repo — use for the "Support URL" / "Homepage URL" fields on
Chrome Web Store, Edge Add-ons, and Firefox AMO.)

## Privacy policy

https://github.com/nawaz13bit/HueMark/blob/main/PRIVACY.md

(Required field on Chrome Web Store / Edge Add-ons for extensions with
broad host permissions; also fill in the "no data collected" declarations
in the store's Privacy Practices tab to match.)

## Submission notes

- Packages: `dist/huemark-0.1.0-chrome-edge.zip` (Chrome Web Store, Edge
  Add-ons) and `dist/huemark-0.1.0-firefox.zip` (Firefox AMO) — identical
  contents, same manifest (includes `browser_specific_settings.gecko` for
  Firefox), built from `scripts/package.ps1`.
- Firefox AMO may request the extension source if it flags anything for
  manual review; no build step is used (plain JS, no bundler/minifier), so
  the submitted zip *is* the source.
- Safari: not yet ported (see README "Next implementation steps").
