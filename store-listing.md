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
- Iframes and shadow DOM — matches inside embedded frames and shadow roots
  are highlighted too, and a tick on the scroll bar marks each match.

**Stays with you**
- Your term list and colors are saved and re-applied automatically every
  time you revisit a page or reopen the browser.
- Save several term lists under a name (up to 10) and switch between them
  in the popup.
- A colorblind-friendly palette is one click away in the popup.

**Keyboard-first navigation**
- Jump to the next/previous match and cycle between terms without touching
  the mouse: Alt+Shift+Up / Down / Left / Right (Cmd+Shift+... on Mac).
- A persistent outline marks your current match so you never lose your
  place while scanning a long page.
- On Chrome, these shortcuts may need to be assigned manually the first
  time: visit `chrome://extensions/shortcuts` and set them there if they
  don't fire out of the box.

**Smarter matching**
- Wildcards (`*`, `?`) and regular expressions (`/pattern/`).
- Accents are ignored automatically, with no setting to turn it off. Letters
  such as ß, ł, đ and œ are handled too.
- Right-click a selected word and choose "Add selection to HueMark" to add it
  as a term.

**Copy matches**
- Click once to collect the matches, then again to copy them with the text
  around each one. The result pastes as rich text or plain text.
- Choose Snippet, Sentence or Paragraph for how much text surrounds each
  match.
- Citation styles: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA, or Plain.
- Web quotes get scroll-to-text links; PDF quotes get page numbers.
- Nothing leaves your device. The result waits in browser session storage
  until you copy it.

**Legal citations**
- A Legal format with 22 jurisdiction options, such as Bluebook (US), OSCOLA
  (UK) and McGill (Canada).
- Checked against real court pages for several jurisdictions; the rest are
  less tested.
- Legal formats follow common practice and are not checked against official
  style guides.
- Anything not recognised as a case gets a web citation instead.

**Privacy**
- No data collection, no analytics, no external servers. Your search terms,
  saved lists and colors are stored locally on your device
  (`chrome.storage.local`) and never leave it.
- HueMark is off in every tab until you switch it on for that tab. It remembers
  which tabs are on as an in-memory list of tab numbers only: no site
  addresses, titles or history are stored.
- Copy matches reads the text of the page you're on only when you use it, and
  copies to your clipboard only when you click Copy.

**Good to know**
- HueMark is switched on per tab. New tabs start off: open the popup and turn
  on "Enabled for this tab" (or use the ⏻ button on the floating bar). After
  updating from an earlier version, switch it on again in the tabs you want.
- Works on any page whose text lives in the real DOM — the vast majority of
  the web.
- Canvas-rendered apps (Google Docs, Google Sheets) can't be highlighted by
  any browser extension, HueMark included — their content is drawn to a
  canvas, not real DOM text.
- In some Wikipedia equations, copied sub- and superscripts run together
  (e.g. "CO 2carbondioxide").

## Full description (Firefox AMO variant)

Same as above, except the Privacy bullet reads:

**Privacy**
- No data collection, no analytics, no external servers. Your search terms,
  saved lists and colors are stored locally in your browser and never leave
  your device.
- HueMark is off in every tab until you switch it on for that tab. It remembers
  which tabs are on as an in-memory list of tab numbers only: no site
  addresses, titles or history are stored.
- Copy matches reads the text of the page you're on only when you use it, and
  copies to your clipboard only when you click Copy.

(Genericized from the Chrome/Edge listing's `chrome.storage.local`
wording — accurate for Firefox too since it aliases `chrome.*` to
`browser.*`, but naming a Chrome-specific API in a Firefox store listing
reads oddly to AMO users.)

## Category

Productivity / Accessibility

## Permission justifications (for store review forms)

- **storage** — save the user's term lists (including saved lists), colors,
  and settings so highlights persist across sessions and reloads; hold the
  result of a Copy matches run until it is copied.
- **scripting** — inject the highlighting engine into pages on demand, and
  read the page's text (including frames) when the user clicks Copy matches.
- **activeTab** — apply highlights to the page the user is currently
  viewing.
- **declarativeNetRequest** — redirect PDF navigations to the bundled
  PDF.js viewer, since browsers don't allow third-party scripts inside
  their built-in PDF viewers.
- **contextMenus** — add an "Add selection to HueMark" item to the right-click
  menu for selected text. Nothing else is read through it.
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
3. Matches highlight immediately. Reload or navigate away and back;
   highlights reapply from saved state.
4. Open a PDF (any http(s) .pdf link, or "Open local PDF..." in the popup);
   the same terms highlight in the bundled PDF.js viewer.
5. Alt+Shift+Up/Down jumps between matches; Alt+Shift+Left/Right cycles the
   active term; Alt+Shift+B opens a floating bar. Chrome doesn't always
   auto-bind these defaults for dev-mode extensions with several commands;
   if a shortcut doesn't fire, set it at `chrome://extensions/shortcuts`.
6. Copy matches (popup): click once to collect, again to copy. The popup
   can be closed while collecting.
7. Right-click a selected word and choose "Add selection to HueMark".

Why broad host permissions (`<all_urls>`): users choose their own terms and
expect them highlighted on any page or PDF, including after reload and as
content streams into dynamic pages (a MutationObserver watches for DOM
changes). `activeTab` is per-gesture and doesn't survive reload or
navigation, which would break the "highlights persist" behavior.
`declarativeNetRequest` also needs broad host access to redirect PDF
navigations (any domain) to the bundled PDF.js viewer, since browsers block
third-party scripts inside their built-in PDF viewer.

Privacy: no data collection, analytics, or remote servers. Terms, saved
lists, colors and settings stay in `chrome.storage.local` and are never
transmitted. Which tabs are switched on is kept as tab numbers only in
`chrome.storage.session` (memory, no URLs). Copy matches reads the open tab only when used and writes to
the clipboard only on Copy. Source: https://github.com/nawaz13bit/HueMark

## Notes to Reviewer (Firefox AMO)

HueMark is a multi-color text/keyword highlighter for web pages and PDFs.
No login, no account, no backend. Extension id: `huemark@fnawaz.dev`.

Test: click the toolbar icon, turn on "Enabled for this tab" (HueMark is off
per tab by default), add a term + color. Matches highlight immediately and
persist across reload/nav in that tab. Open any http(s) .pdf, or
"Open local PDF..." in the popup, to see terms highlighted in the
bundled PDF.js viewer. Alt+Shift+Up/Down/Left/Right nav; Alt+Shift+B for
a floating bar. Copy matches (popup) and right-click "Add selection to
HueMark" (contextMenus) are also available.

`<all_urls>` + `declarativeNetRequest`: users pick their own terms and
expect them highlighted on any site/PDF, incl. after reload (activeTab
doesn't survive that) and via MutationObserver on dynamic pages; DNR
redirects PDF navigations to the bundled viewer.

No build step for HueMark's own code (`src/`, plain unbundled JS — the
zip is the source). `vendor/pdfjs/` is Mozilla's PDF.js v6.4.299 generic
dist build (their own bundling, readable, not minified). One deliberate
patch in `web/viewer.mjs` (search `HueMark:` near line 20460): the
upstream `validateFileURL` cross-origin guard is neutered. That guard
stops a *hosted, embeddable* PDF.js viewer from being pointed by a
third-party site at an arbitrary `?file=` URL (SSRF/XSS mitigation).
HueMark's viewer is never hosted/embeddable — only reached via this
extension's own `declarativeNetRequest` redirect, so the file's origin
is always the page the user navigated to, making the guard a no-op here
by design. Details in `vendor/pdfjs/README.md`.

Linter warnings (6x "unsafe import", 1x "unsafe innerHTML") are
unrelated, in unpatched `vendor/pdfjs/` code: PDF.js's own dynamic
loading of its worker/sandbox/debug bundles and l10n templating, all
resolving to bundled files/JSON, never remote/user data.

Privacy: no data collection/analytics/remote servers. Terms, saved lists
and colors stored locally (Firefox aliases `chrome.*` to `browser.*`). Tab
on/off state is tab numbers only, in session (memory) storage. Copy
matches reads the open tab's text only on request and writes to the
clipboard only on Copy. Source:
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

## Version notes (Firefox AMO submission form)

Initial release (0.1.0). Multi-color text/keyword highlighter for web
pages and PDFs, with a bundled PDF.js viewer, keyboard navigation
between matches, persistent highlights across reload/revisit, and a
colorblind-friendly palette option. No account, no backend, no data
collection.

## Submission notes

- Packages: `dist/huemark-0.1.0-chrome-edge.zip` (Chrome Web Store, Edge
  Add-ons) and `dist/huemark-0.1.0-firefox.zip` (Firefox AMO) — identical
  contents, same manifest (includes `browser_specific_settings.gecko` for
  Firefox), built from `scripts/package.ps1`.
- Firefox AMO may request the extension source if it flags anything for
  manual review; no build step is used (plain JS, no bundler/minifier), so
  the submitted zip *is* the source.
- Safari: not yet ported (see README "Next implementation steps").
