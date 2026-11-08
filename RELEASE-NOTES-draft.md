# HueMark 0.2.0 release notes (draft)

Built from `git log v0.1.1..HEAD` (9 commits) on 2026-11-03. Not published.

**Upgrading from 0.1.1:** HueMark now starts OFF in every tab. After updating, turn it on for each tab you want (popup switch, or the power button on the bar). The old global Enabled checkbox is gone. The extension also asks for one new permission, `contextMenus` (right-click menu), so the browser may ask you to approve the update.

## Added
- **Copy matches.** The popup button collects every match on the page or PDF, then copies it as rich text and plain text. Click once to collect, and again to copy when it reads "Export ready". Navigation, sidebars, reference lists and label-only lines are left out.
- **Format presets:** Matches (every hit), Citation, Legal, Research, Resume.
  - Citation adds a reference and an in-text citation for each quote in APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA or Plain style. Citation details come from scholarly meta tags, OpenGraph and JSON-LD. Missing fields are left out, not invented.
  - Legal formats cite court decisions in 22 country and court styles (for example US Bluebook, UK OSCOLA, Canada McGill, Australia AGLC, EU, Brazil, Japan, Korea, China, Russia, Argentina, Mexico, Colombia).
  - Research adds author, year, source and section for each passage. Resume lists which terms were found, with counts and locations.
- **Passage modes:** Snippet, Sentence or Paragraph. Passages with several terms are grouped under one header such as "cat + dog" (default). Untick this to repeat the passage under each term.
- **Saved term lists.** Save the current terms under a name and reuse them later. Up to 10 lists. Delete needs two clicks.
- **Wildcards and regex.** `*` and `?` match any run of letters or digits. `/pattern/` is a regular expression. A broken regex is flagged and skipped.
- **Accent folding** is always on, so "cafe" also finds "café" and "strasse" finds "straße". Covers ß, ł, đ, œ and other letters.
- **CSS Highlight engine.** When a page removes HueMark's `<mark>` elements, highlighting switches automatically to the browser's CSS Custom Highlight API.
- **Iframes and shadow DOM.** Match counts, navigation and highlights now cover embedded frames and shadow roots, not just the top page.
- **Scroll-bar ticks.** A small marker on the scroll bar for each match.
- **Right-click "Add selection to HueMark"** adds the selected text as a term and turns highlighting on for that tab.
- **Per-tab on/off.** Switch HueMark on or off for the current tab (or PDF) from the popup or the bar. Switching off clears that tab's highlights and keeps your terms.
- **arXiv PDFs.** Links of the form arxiv.org/pdf/<id> open in HueMark's PDF viewer.
- **Open PDF viewer** button in the popup, with an open bar inside the viewer.
- **Keyboard shortcut tip.** On first run, if all shortcuts are assigned, the popup shows a one-time tip that the keys jump between matches and can be changed. If any shortcut is unassigned, the existing "Set shortcuts" banner still shows until dismissed.
- **Help text** for presets, saved lists and PDFs, in all 13 interface languages.
- **Test suites** in `tests/live/` (Chromium, Edge) and `tests/firefox/` (Firefox). Developer use only; not in the store packages.

## Changed
- **Off by default per tab.** Highlights are no longer on everywhere by default. Each tab starts off and stays off until switched on. Only a list of tab numbers is kept, in session memory. No URLs, site names or history are stored, and the list clears when a tab or the browser closes.
- **Simpler popup.** The export and citation options (Format, Style, Extract, Copy matches) now sit in a collapsed "Advanced: export & citations" section. Terms, saved lists, whole-word, colorblind palette, Open PDF viewer and Clear all stay on the main screen. The section remembers whether you left it open.
- **Bar close button** is now "Hide bar". It hides the bar only; highlights stay on.
- **PDF.js** updated to 6.4.299 (viewer translations added for the 13 languages HueMark ships).
- **Permissions:** `contextMenus` added (for the right-click item). Content scripts now also run in `about:blank` frames.
- **Docs:** README, store listing (13 languages) and privacy policy updated for the above.

## Fixed
- PDF redirect rules are re-registered whenever the background worker starts. Previously PDFs could open in the browser's own viewer until the browser restarted.

## Removed
- **Global Enabled checkbox.** Replaced by the per-tab switch.
- **"Open local PDF..." button** and its help text. Use "Open PDF viewer" instead. On Chrome and Edge, local PDFs still open automatically if "Allow access to file URLs" is enabled for HueMark.

## Known issues
- Sub- and superscripts can run together in some exported equations (for example "CO 2carbondioxide").
- Hidden-tab PDF export has not been verified.
- Citation styles: APA 7, Vancouver (NLM) and IEEE were checked against their official guides, MLA 9 against secondary sources, and Chicago, Harvard and AMA against public university guides and real articles (not the official manuals).
- Legal citation formats: OSCOLA was checked against its official guide and AGLC4 rules come from a library copy; Bluebook was checked only against a public guide; the rest follow common practice (many were checked on real court pages). Non-English translations have not been reviewed by native speakers. Anything not recognised as a case falls back to a web-page citation.
- Safari is not supported.
