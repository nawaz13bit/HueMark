// Core highlighting engine. No chrome.* calls here - pure DOM logic,
// so it can be reused by the PDF viewer page too.

if (window.__huemarkHighlighterLoaded) {
  throw new Error("huemark-highlighter-already-loaded"); // stop this duplicate injection cold
}
window.__huemarkHighlighterLoaded = true;

const HUEMARK_CLASS = "huemark-highlight";
const HUEMARK_ATTR = "data-huemark-term";
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT",
  "IFRAME", "SVG", "CANVAS", "SELECT", "OPTION"
]);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatcher(terms, wholeWord) {
  // terms: [{ term, color }]
  const alternatives = terms
    .filter(t => t.term && t.term.trim().length > 0)
    .sort((a, b) => b.term.trim().length - a.term.trim().length) // longest match first
    .map(t => escapeRegExp(t.term.trim()));

  if (alternatives.length === 0) return null;

  // Plain \b only recognizes ASCII [a-zA-Z0-9_] as "word" characters, so it
  // misplaces boundaries around accented Latin (café, naïve) and non-Latin
  // scripts (Cyrillic, Arabic, Hebrew), and is meaningless for CJK text
  // (no spaces between words). Unicode property lookaround treats any
  // letter/number/mark in any script as a word character instead.
  const before = wholeWord ? "(?<![\\p{L}\\p{N}\\p{M}])" : "";
  const after = wholeWord ? "(?![\\p{L}\\p{N}\\p{M}])" : "";
  const pattern = `${before}(${alternatives.join("|")})${after}`;
  return new RegExp(pattern, "giu");
}

function colorForMatch(matchText, terms) {
  const lower = matchText.toLowerCase();
  let best = null;
  for (const t of terms) {
    if (!t.term) continue;
    if (t.term.trim().toLowerCase() === lower) return t.color;
    if (!best && lower.includes(t.term.trim().toLowerCase())) best = t.color;
  }
  return best || terms[0]?.color || "#ffff00";
}

// WCAG-style relative luminance -> pick black or white text so it stays
// readable no matter how dark/light the user's chosen highlight color is.
function textColorFor(hexColor) {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.55 ? "#111111" : "#ffffff";
}

function isInsideExistingHighlight(node) {
  let el = node.parentElement;
  while (el) {
    if (el.classList && el.classList.contains(HUEMARK_CLASS)) return true;
    el = el.parentElement;
  }
  return false;
}

function shouldSkipElement(el) {
  if (!el) return true;
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.isContentEditable) return true;
  if (el.closest && el.closest(`.${HUEMARK_CLASS}`)) return true;
  return false;
}

function collectTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
        if (isInsideExistingHighlight(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function highlightTextNode(textNode, regex, terms) {
  const text = textNode.nodeValue;
  regex.lastIndex = 0;
  if (!regex.test(text)) return false;
  regex.lastIndex = 0;

  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  let match;
  let found = false;

  while ((match = regex.exec(text)) !== null) {
    found = true;
    const [full] = match;
    const start = match.index;
    const end = start + full.length;

    if (start > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    const mark = document.createElement("mark");
    mark.className = HUEMARK_CLASS;
    mark.setAttribute(HUEMARK_ATTR, full.toLowerCase());
    // Dark-mode extensions (Dark Reader, etc.) repaint page colors, often
    // via injected stylesheet rules or a page-wide invert filter. !important
    // wins over an injected stylesheet rule targeting `mark`, and forced-
    // color-adjust/color-scheme tell the browser's own native dark theming
    // (and extensions that respect it) to leave this element's colors alone.
    // A filter-based invert on the whole page can still shift the hue -
    // that's a platform limitation, not something an element style can stop.
    const bg = colorForMatch(full, terms);
    mark.style.cssText =
      `background-color: ${bg} !important;` +
      `color: ${textColorFor(bg)} !important;` +
      `forced-color-adjust: none;` +
      `color-scheme: light;`;
    mark.textContent = full;
    frag.appendChild(mark);

    lastIndex = end;
    if (regex.lastIndex === match.index) regex.lastIndex++; // avoid infinite loop on zero-width
  }

  if (!found) return false;

  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(frag, textNode);
  return true;
}

function highlight(root, terms, options = {}) {
  const regex = buildMatcher(terms, !!options.wholeWord);
  if (!regex) return 0;

  const textNodes = collectTextNodes(root);
  let count = 0;
  for (const node of textNodes) {
    if (!node.parentNode) continue; // may have been detached by an earlier replace
    if (highlightTextNode(node, regex, terms)) count++;
  }
  return count;
}

function clearHighlights(root) {
  const marks = root.querySelectorAll(`.${HUEMARK_CLASS}`);
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  }
}

// Exposed for content.js
window.__huemark = { highlight, clearHighlights, HUEMARK_CLASS };
