# HueMark

A browser extension that searches for and highlights multiple words or phrases
at once, each in its own color, across:

- **Static pages** — highlighted on load.
- **Dynamically generated pages (SPAs)** — a `MutationObserver` watches for new
  content and highlights it as it appears, so infinite-scroll feeds, chat
  apps, etc. stay highlighted without a manual re-run.
- **Reload persistence** — your term list is saved via `chrome.storage.sync`,
  so every page you (re)load auto-applies the same highlights until you clear
  them.
- **PDFs** — a bundled PDF.js viewer highlights matches in both local and
  http(s) PDFs.
- **Keyboard navigation** — jump between matches and cycle terms without
  touching the mouse (`Alt+Shift+Up/Down/Left/Right`, `Cmd+Shift+...` on Mac),
  with a persistent current-match outline so you never lose your place.
- **Colorblind-friendly palette** — toggle an alternate palette tuned for
  colorblind accessibility.

## Status: MVP

What works today: any page whose text lives in the real DOM (which is the
vast majority of the web).

## Known limitation: canvas-rendered apps (Google Docs, Google Sheets)

Google Docs and Sheets don't render their content as DOM text — the document
body is a `<canvas>` that Google draws glyphs onto directly, with an
invisible, largely decorative text layer for accessibility/copy-paste. **No
browser extension can inject visual highlights into canvas pixels the way it
can wrap DOM text in a `<mark>`.** This isn't a HueMark gap to fix later, it's
a platform constraint every text-highlighting extension hits (Grammarly, web
clippers, etc. all have the same hole for Docs/Sheets).

Realistic paths forward, if this is still wanted later:
1. **Docs/Sheets Editor Add-on** (separate project, built with Apps Script /
   Google Workspace Editor Add-ons API) — this runs *inside* Docs/Sheets with
   real access to the document model and can apply actual text background
   colors. Different extension surface, different codebase.
2. A "jump to match" experience using each app's native Find (Ctrl+F) driven
   by simulated keystrokes, without true persistent highlighting.

Excel *files* opened locally, and Word documents opened as local files,
aren't reachable by a content script at all (browsers don't run extensions
against `file://` Office documents unless converted to HTML/PDF first).
Whether Excel/Word opened through Office Online exposes accessible DOM text
(vs. canvas rendering, like Docs/Sheets) is unverified — needs investigation
before promising support either way.

## PDF support

Chrome's built-in PDF viewer is itself a separate, sandboxed extension —
third-party content scripts cannot be injected into it, and the API that
would let an extension act as the PDF handler (`mimeHandlerPrivate`) is
Chrome-internal only, not available to third-party extensions. HueMark works
around this by:
- Bundling PDF.js as its own viewer page (`vendor/pdfjs`, shipped in the
  extension and listed in `web_accessible_resources`).
- Redirecting PDF navigations to that bundled viewer via a
  `declarativeNetRequest` rule.
- Letting PDF.js render a real text-layer DOM over the canvas, which
  `highlighter.js`'s existing `highlight()`/`clearHighlights()` targets
  directly with no changes.

Works for both http(s) and local (`file://`) PDFs on Chrome, Edge, and
Firefox.

On Firefox, local PDFs must be opened via the popup's "Open local PDF..."
button, which opens the bundled PDF.js viewer tab — use the viewer's own
"Open File" button from there to pick your file. Firefox tears down the
extension popup the instant a native file picker opens, so the popup's
own in-popup file picker (used on Chrome/Edge) doesn't work there.

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge | Fully working |
| Firefox | Fully working |
| Safari | Not yet ported |

## Project layout

```
HueMark/
  manifest.json         MV3 manifest
  src/
    background.js         installs default storage state
    highlighter.js         DOM-walking highlight engine (pure, reusable)
    content.js              wires highlighter.js to storage + MutationObserver
    popup.html/css/js       term list + color picker UI
    pdf-picker.js            wires highlighter.js into the bundled PDF.js viewer
  vendor/pdfjs/            bundled PDF.js viewer (see vendor/pdfjs/LICENSE)
  icons/                    toolbar icons
```

## Try it locally

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**, select the `HueMark` folder.
4. Click the HueMark icon, add a couple of words with colors, and open any
   webpage — matches highlight immediately and stay highlighted as the page
   updates or is reloaded.

## Next implementation steps

- [ ] Per-site enable/disable (currently global on/off only).
- [ ] Safari port.
- [ ] Consider rewriting the highlight engine on the [CSS Custom Highlight
      API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)
      (`CSS.highlights` + `Highlight` + `Range`, Chrome 105+). It paints
      highlights without touching the DOM at all, which sidesteps the
      current approach's main risk on heavily-reactive sites: wrapping text
      in `<mark>` can conflict with React/Vue's own re-rendering of that
      same DOM (reverted highlights, or errors when the framework tries to
      remove a text node HueMark has replaced).

## License

MIT — see [LICENSE](LICENSE). The bundled PDF.js (`vendor/pdfjs`) is
Apache-2.0 licensed by Mozilla; see `vendor/pdfjs/LICENSE`.
