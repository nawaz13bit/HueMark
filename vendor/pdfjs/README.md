# Vendored PDF.js

Source: PDF.js **6.4.299**, generic (non-Firefox) dist build. Apache-2.0, see `LICENSE`.

## Trim from upstream dist

Only what the viewer needs at runtime is kept:
- `build/pdf.mjs`, `build/pdf.worker.mjs`, `build/pdf.sandbox.mjs`
- `web/` (viewer.html, viewer.mjs, viewer.css, cmaps, iccs, images, locale, standard_fonts, wasm)

`web/locale` was trimmed to the 13 PDF.js folders that match HueMark's own `_locales/` set: `ar`, `de`, `en-US`, `es-ES`, `fr`, `hi-IN`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `zh-CN`, `zh-TW`, plus `locale.json`. `locale.json` is kept exactly as upstream, so it still lists every PDF.js language; only the folders for the other languages are missing. Restore the full set from the upstream dist (or git history) if more languages are ever wanted. When re-vendoring, keep only these folders (tests/live/09-presets-locale checks that they exist).

## Patches applied to `web/viewer.mjs`

1. **`validateFileURL` neutered** (search for `HueMark:` comment near the function). Upstream throws if the `?file=` URL's origin doesn't match the viewer's own origin — a guard meant for the *hosted*, publicly-embeddable PDF.js viewer (stops third-party sites from pointing it at an arbitrary cross-origin URL, an SSRF/XSS mitigation). HueMark's viewer is never hosted or embeddable that way: it's only reachable via `background.js`'s own `declarativeNetRequest` redirect, and by design the PDF's origin is always different from the extension's origin (it's whatever site the user navigated to). The function body was replaced with a no-op.

2. **`web/viewer.html`**: CSP relaxed to `style-src 'self' 'unsafe-inline'` and `connect-src * file: blob: data:`, plus the HueMark `<script>` block before `</body>`. The viewer's toolbar and menus are stock; HueMark adds nothing to them.

## Re-vendoring

When updating to a newer PDF.js release:
1. Download the **generic** dist build (not the Firefox-specific one).
2. Copy over the trimmed file set above.
3. Re-apply the `validateFileURL` no-op patch.
4. Confirm `web/viewer.mjs`'s `AppOptions.sandboxBundleSrc` default (`../build/pdf.sandbox.mjs`) still resolves relative to `build/` — copy `pdf.sandbox.mjs` too, it's easy to miss since it's only needed for PDFs with embedded scripting/AcroForms.
5. Re-check `web/viewer.html`'s CSP meta tag still permits `worker-src 'self' blob:` (needed for the sandbox worker) and still has HueMark's `<script src="../../../src/highlighter.js">` / `<script src="../../../src/content.js">` tags before `</body>`.
