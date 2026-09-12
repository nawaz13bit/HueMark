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
- **host permissions (`<all_urls>`)** — highlighting is a general-purpose
  tool the user can invoke on any site or PDF they visit; there's no fixed
  set of domains to scope to.

## Screenshots (in `screenshots/`, ready to upload)

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
