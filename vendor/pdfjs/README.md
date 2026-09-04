# Vendored PDF.js

Source: PDF.js **6.3.289**, generic (non-Firefox) dist build. Apache-2.0, see `LICENSE`.

## Trim from upstream dist

Only what the viewer needs at runtime is kept:
- `build/pdf.mjs`, `build/pdf.worker.mjs`, `build/pdf.sandbox.mjs`
- `web/` (viewer.html, viewer.mjs, viewer.css, cmaps, iccs, images, locale, standard_fonts, wasm)

`web/locale` was trimmed to the locales HueMark ships strings for (see git history if restoring the full set is ever needed).

## Patches applied to `web/viewer.mjs`

1. **`validateFileURL` neutered** (search for `HueMark:` comment near the function). Upstream throws if the `?file=` URL's origin doesn't match the viewer's own origin — a guard meant for the *hosted*, publicly-embeddable PDF.js viewer (stops third-party sites from pointing it at an arbitrary cross-origin URL, an SSRF/XSS mitigation). HueMark's viewer is never hosted or embeddable that way: it's only reachable via `background.js`'s own `declarativeNetRequest` redirect, and by design the PDF's origin is always different from the extension's origin (it's whatever site the user navigated to). The function body was replaced with a no-op.

## Re-vendoring

When updating to a newer PDF.js release:
1. Download the **generic** dist build (not the Firefox-specific one).
2. Copy over the trimmed file set above.
3. Re-apply the `validateFileURL` no-op patch.
4. Confirm `web/viewer.mjs`'s `AppOptions.sandboxBundleSrc` default (`../build/pdf.sandbox.mjs`) still resolves relative to `build/` — copy `pdf.sandbox.mjs` too, it's easy to miss since it's only needed for PDFs with embedded scripting/AcroForms.
5. Re-check `web/viewer.html`'s CSP meta tag still permits `worker-src 'self' blob:` (needed for the sandbox worker) and still has HueMark's `<script src="../../../src/highlighter.js">` / `<script src="../../../src/content.js">` tags before `</body>`.
