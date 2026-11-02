# HueMark release notes (draft, after v0.1.1)

Built from project notes on 2026-11-01; not diffed against the v0.1.1 tag, so verify before publishing.

## Visible changes
1. **Saved term lists.** Up to 10 lists in the popup, with inline save, 2-click delete and a dirty-state dot. The cap is a UX limit, not a performance one.
2. **Copy matches.** A Format menu with Matches, Citation, Legal, Research and Resume.
   - Click once to collect, click again to copy. Output pastes as rich text and as plain text.
   - Modes: Snippet, Sentence, Paragraph; clubbed ("a + b") headers by default.
   - Citation styles: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA, Plain.
   - Scroll-to-text links on web quotes; page numbers on PDFs.
   - Citation details are read from scholarly meta tags (citation_*, Dublin Core, PRISM), then OpenGraph, then JSON-LD: title, authors, date, journal, volume, issue, pages, publisher, DOI. Journal articles with a DOI cite the DOI link; other pages get a web-page reference with URL and access date.
   - Each quote gets an in-text citation in the chosen style; legal styles put the case citation in the reference instead. Missing fields are omitted, never invented.
   - Research format adds author, year, source and section per passage; Resume lists which terms were found, with counts and location.
3. **Legal.** Its own Format with a 22-option country menu (see below).
4. **Matching.** Wildcard/regex terms; accent folding always on (no toggle; ß, ł, đ, œ and others); CSS Highlight engine fallback that switches in automatically.
5. **Page coverage.** Highlights inside iframes and shadow DOM; a scroll-bar tick marker per match.
6. **Right-click add.** Add a selected word as a term from the context menu.
7. **PDF.** "Open PDF viewer" button, an open bar inside the viewer, PDF.js updated to 6.4.299.
8. **Popup help text** in all 13 locales.
9. **Per-tab on/off (behaviour change).** HueMark now starts OFF in every tab, including after an update, and you switch it on per tab (or per PDF) with the popup switch or the bar's ⏻ button. There is no global setting any more. Switching off clears that tab's highlights and keeps your terms; ✕ on the bar only hides the bar. Right-click "add" also turns the tab on. Only a list of tab numbers is kept, in session memory: no URLs, site names or history are stored, and it clears when a tab or the browser closes. Export on an off tab says "Off on this tab". Strings are localized in all 13 locales.
   - Existing users: after updating, highlights will not appear until the tab is switched on; the popup shows "HueMark is off on this tab. Turn it on to highlight." Say so in the store description and the release notes.

## Legal
- **Verified on real pages:** France, India, Portugal, UK, Germany, Switzerland, Austria, Spain, Colombia, Korea, Japan, Russia, Canada (McGill), Italy, China (guiding cases only), US Bluebook (Library of Congress PDF of Brown v. Board, Cornell LII page).
- **Built, fixture-tested only:** EU, Australia (AGLC), Mexico, Brazil (need single-judgment URLs), Argentina (CSJN), Arabic courts, ordinary China judgment pages.
- **Not built:** see section D of `tests/live/TASKLIST.md`. These fall back to the generic web-page citation.
- **Caveats:** formats are common practice, not checked against official style guides. Non-English translations are unreviewed by native speakers. Anything not recognised as a case falls back to a web citation.

## Known gaps to disclose
- Sub- and superscripts get glued together in Wikipedia equations ("CO 2carbondioxide").
- Hidden-tab PDF rendering is unverified.
- Safari is not supported.
- CSS engine and the newest legal detectors have had no code review.

## Release checklist
- [ ] Update `store-listing.md` and `store-listing-i18n.md` (13 locales) for the above.
- [ ] Re-check privacy/permissions text (export uses the clipboard and background tab reads).
- [ ] Update README.
- [ ] Version bump, rebuild Chrome/Edge/AMO packages, new tag, GitHub Release.
- [ ] Commit and push (5 earlier local commits are unpushed; most of this work is uncommitted).
- [ ] Manual real-browser checks in `tests/live/TASKLIST.md` (including the arXiv `/pdf/<id>` redirect).
