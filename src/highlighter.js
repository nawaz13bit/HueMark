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

// Terms/options rarely change between highlight passes (mutation batches can
// fire many times per second while nothing the user configured is different),
// so the last built regex is cached and reused rather than rebuilt from
// scratch every time.
let lastMatcherKey = null;
let lastMatcher = null;

// What a wildcard "*" / "?" stands for: any run of letters/digits/marks/_ in
// any script - not "\S", which would swallow trailing punctuation ("test*"
// on "testing," must not highlight the comma).
const WORD_CHAR = "[\\p{L}\\p{N}\\p{M}_]";

// A term written as /pattern/ is a regular expression (case-insensitive,
// like every other term). Returns the pattern source, or null if the term
// isn't in that form.
function regexSourceOf(term) {
  const m = /^\/(.+)\/$/.exec(term);
  return m ? m[1] : null;
}

// Plain terms: "*" = any run of word characters, "?" = exactly one word
// character, and a backslash makes the next character literal ("\*", "\?",
// "\\", "\/"). Everything else is matched literally.
function wildcardToSource(term) {
  let out = "";
  for (let i = 0; i < term.length; i++) {
    const ch = term[i];
    if (ch === "\\" && i + 1 < term.length) {
      out += escapeRegExp(term[++i]);
    } else if (ch === "*") {
      out += `${WORD_CHAR}*`;
    } else if (ch === "?") {
      out += WORD_CHAR;
    } else {
      out += escapeRegExp(ch);
    }
  }
  return out;
}

// The lowercase key content.js/popup.js use to group a term's <mark>s.
function termKey(term) {
  return term.trim().toLowerCase();
}

// Accent folding. Only scripts where diacritics are optional decoration get
// folded - Latin and Greek letters are decomposed (NFD) and their combining
// marks dropped (café -> cafe, Ελλάδα -> Ελλαδα), and Arabic/Hebrew vowel
// points are dropped. Everywhere else the marks carry meaning (Devanagari
// matras, Japanese dakuten, Hangul jamo, Cyrillic й/ё), so those characters
// are left exactly as they are.
const FOLDABLE_LETTER = /[\p{Script=Latin}\p{Script=Greek}]/u;
const OPTIONAL_POINTS = /[ؐ-ًؚ-ٰٟۖ-ְۭ-ׇֽֿׁׂׅׄ]/u;
const COMBINING_MARKS = /\p{M}/gu;

// Latin letters Unicode doesn't decompose, so NFD can't fold them. Mapped to
// the plain spelling a keyboard without them would use (straße -> strasse,
// Łódź -> Lodz, cœur -> coeur). Both query and page text go through this, and
// matching is case-insensitive, so one case each is enough for the capitals.
const FOLD_MAP = {
  "ß": "ss", "ẞ": "SS",
  "ł": "l", "Ł": "L",
  "đ": "d", "Đ": "D", "ð": "d", "Ð": "D",
  "ø": "o", "Ø": "O",
  "œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE",
  "ħ": "h", "Ħ": "H", "ŧ": "t", "Ŧ": "T",
  "ı": "i",
};

// afterFoldable: the previous character was a foldable letter, so a stray
// combining mark (decomposed input like e + U+0301) belongs to it and goes too.
function foldChar(ch, afterFoldable) {
  if (OPTIONAL_POINTS.test(ch)) return "";
  if (afterFoldable && /^\p{M}$/u.test(ch)) return "";
  if (!FOLDABLE_LETTER.test(ch)) return ch;
  if (FOLD_MAP[ch]) return FOLD_MAP[ch];
  return ch.normalize("NFD").replace(COMBINING_MARKS, "");
}

function foldAccents(str) {
  let out = "";
  let afterFoldable = false;
  for (const ch of str) {
    out += foldChar(ch, afterFoldable);
    afterFoldable = afterFoldable && /^\p{M}$/u.test(ch) ? true : FOLDABLE_LETTER.test(ch);
  }
  return out;
}

// Folded text plus, for each UTF-16 unit of it, the index it came from in
// the original (so a match found in the folded text can be mapped back).
function foldWithIndexes(text) {
  let out = "";
  const indexes = [];
  let i = 0;
  let afterFoldable = false;
  for (const ch of text) {
    const f = foldChar(ch, afterFoldable);
    for (let k = 0; k < f.length; k++) indexes.push(i);
    out += f;
    i += ch.length;
    afterFoldable = afterFoldable && /^\p{M}$/u.test(ch) ? true : FOLDABLE_LETTER.test(ch);
  }
  return { text: out, indexes };
}

// Whether a term compiles - lets the popup flag a broken /regex/ instead of
// it silently never matching.
function isValidTerm(term) {
  const src = regexSourceOf(term.trim());
  if (src === null) return true;
  try {
    new RegExp(src, "u");
    return true;
  } catch {
    return false;
  }
}

// Returns { regex, keys } where each term is its own named group t0, t1, ...
// (named, not numbered: a user /regex/ may contain capture groups of its own,
// which would shift numbered indexes), and keys[i] is the termKey of group
// ti. Which group is defined on a match says which term produced it, so the
// color/grouping no longer depends on the matched text equalling the term
// (wildcards and regexes match text that differs from the term itself).
function buildMatcher(terms, wholeWord, accentInsensitive = true) {
  // terms: [{ term, color }]
  const key = `${wholeWord}|${accentInsensitive}|${JSON.stringify(terms.map(t => t.term))}`;
  if (key === lastMatcherKey) {
    if (lastMatcher) lastMatcher.regex.lastIndex = 0;
    return lastMatcher;
  }

  // Plain \b only recognizes ASCII [a-zA-Z0-9_] as "word" characters, so it
  // misplaces boundaries around accented Latin (café, naïve) and non-Latin
  // scripts (Cyrillic, Arabic, Hebrew), and is meaningless for CJK text
  // (no spaces between words). Unicode property lookaround treats any
  // letter/number/mark in any script as a word character instead.
  const before = wholeWord ? "(?<![\\p{L}\\p{N}\\p{M}])" : "";
  const after = wholeWord ? "(?![\\p{L}\\p{N}\\p{M}])" : "";

  const seen = new Set();
  const candidates = [];
  for (const t of terms) {
    const trimmed = (t.term || "").trim();
    if (!trimmed || seen.has(termKey(trimmed))) continue; // duplicate keys: first one wins
    seen.add(termKey(trimmed));
    // The page text is folded when accentInsensitive, so the term has to be too.
    const pattern = accentInsensitive ? foldAccents(trimmed) : trimmed;
    const reSrc = regexSourceOf(pattern);
    let source;
    if (reSrc !== null) {
      if (!isValidTerm(trimmed)) continue; // broken regex: skip it, keep the rest working
      source = reSrc; // regex terms control their own boundaries
    } else {
      source = `${before}${wildcardToSource(pattern)}${after}`;
    }
    candidates.push({ key: termKey(trimmed), source, length: trimmed.length });
  }
  candidates.sort((a, b) => b.length - a.length); // longest match first

  let result = null;
  if (candidates.length > 0) {
    const pattern = candidates.map((c, i) => `(?<t${i}>${c.source})`).join("|");
    try {
      result = { regex: new RegExp(pattern, "giu"), keys: candidates.map((c) => c.key), accentInsensitive };
    } catch {
      // Individually-valid pieces can still clash when combined (e.g. a
      // regex using \1 backreferences) - fall back to no highlighting
      // rather than throwing inside a MutationObserver callback.
      result = null;
    }
  }
  lastMatcherKey = key;
  lastMatcher = result;
  return result;
}

// term key -> color, first term wins on duplicate keys (matches buildMatcher).
function colorsByKey(terms) {
  const map = new Map();
  for (const t of terms) {
    const k = termKey(t.term || "");
    if (k && !map.has(k)) map.set(k, t.color);
  }
  return map;
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

// Many sites keep text nodes in the DOM that are never actually rendered -
// a closed dropdown/menu, a mobile-vs-desktop nav variant hidden by CSS,
// sr-only accessibility text, or a hidden "measurement" clone used for
// layout math. Matching inside those makes it look like a highlight
// exists for text the user can never see on the page.
function isHidden(el) {
  if (typeof el.checkVisibility === "function") {
    return !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  }
  let node = el;
  while (node && node.nodeType === 1) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return true;
    node = node.parentElement;
  }
  return false;
}

function shouldSkipElement(el) {
  if (!el) return true;
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.isContentEditable) return true;
  // el.closest() checks el itself then walks its ancestors, so this alone
  // also covers "is this text already inside an existing highlight" -
  // no separate ancestor walk needed for that.
  if (el.closest && el.closest(`.${HUEMARK_CLASS}`)) return true;
  if (isHidden(el)) return true;
  return false;
}

// A text node sitting directly in a shadow root has no parentElement; its
// host is the nearest element for visibility purposes.
function parentElementOf(node) {
  return node.parentElement || node.parentNode?.host || null;
}

function isHighlightable(node) {
  if (!node.nodeValue || !node.nodeValue.trim()) return false;
  if (shouldSkipElement(parentElementOf(node))) return false;
  return true;
}

// ---------------------------------------------------------------------
// Shadow DOM. A TreeWalker and querySelectorAll stop at a shadow boundary, so
// every shadow root met while walking is remembered here: collectTextNodes
// descends into them, clearHighlights/queryMarks look inside them, and
// content.js is told about each new one (to observe it for mutations).
// Closed roots are reachable too - extensions get a special accessor.
// ---------------------------------------------------------------------

const OWN_HOST_IDS = new Set(["huemark-float-bar-host", "huemark-markers-host"]);
const shadowRoots = new Set();
let shadowRootListener = null;

function shadowRootOf(el) {
  if (OWN_HOST_IDS.has(el.id)) return null;
  if (el.shadowRoot) return el.shadowRoot;
  try {
    if (typeof chrome !== "undefined" && chrome.dom?.openOrClosedShadowRoot) {
      return chrome.dom.openOrClosedShadowRoot(el);
    }
    return el.openOrClosedShadowRoot || null; // Firefox
  } catch {
    return null;
  }
}

function registerShadowRoot(sr) {
  if (shadowRoots.has(sr)) return;
  shadowRoots.add(sr);
  if (typeof adoptSheet === "function") adoptSheet(sr);
  if (shadowRootListener) shadowRootListener(sr);
}

// Calls fn for every shadow root seen so far (and for each new one later).
function onShadowRoot(fn) {
  shadowRootListener = fn;
  shadowRoots.forEach((sr) => fn(sr));
}

// Drops roots whose host has left the document so the set can't grow forever.
function liveShadowRoots() {
  for (const sr of shadowRoots) {
    if (!sr.host.isConnected) shadowRoots.delete(sr);
  }
  return shadowRoots;
}

function collectTextNodes(root) {
  const nodes = [];
  const queue = [root];

  const enterShadow = (el) => {
    const sr = shadowRootOf(el);
    if (!sr) return;
    registerShadowRoot(sr);
    queue.push(sr);
  };
  if (root.nodeType === Node.ELEMENT_NODE) enterShadow(root); // the walker never visits its own root

  while (queue.length > 0) {
    const walker = document.createTreeWalker(
      queue.pop(),
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            enterShadow(node);
            return NodeFilter.FILTER_SKIP; // look at its children, not at the element itself
          }
          return isHighlightable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
  }
  return nodes;
}

// Every match of the matcher in text, as [{ start, end, termIdx }] offsets into
// the original text (shared by both engines).
function findMatches(text, matcher) {
  const { regex, keys } = matcher;
  // With accent-insensitive matching the regex runs over a folded copy of the
  // text; indexes[i] is where folded char i came from in the real text, so
  // matches can be cut out of (and the marks wrap) the original, accented text.
  const folded = matcher.accentInsensitive ? foldWithIndexes(text) : null;
  const haystack = folded ? folded.text : text;
  regex.lastIndex = 0;
  if (!regex.test(haystack)) return [];
  regex.lastIndex = 0;

  const found = [];
  let match;
  while ((match = regex.exec(haystack)) !== null) {
    if (match[0].length === 0) { // e.g. /x*/ - nothing to highlight, just advance
      regex.lastIndex++;
      continue;
    }
    const start = folded ? folded.indexes[match.index] : match.index;
    let foldedEnd = match.index + match[0].length;
    // A match ending inside an expanded letter (the first "s" of ß -> "ss")
    // still has to cover that whole original letter.
    if (folded) {
      while (foldedEnd < haystack.length && folded.indexes[foldedEnd] === folded.indexes[foldedEnd - 1]) foldedEnd++;
    }
    const end = folded ? (foldedEnd >= haystack.length ? text.length : folded.indexes[foldedEnd]) : foldedEnd;
    let termIdx = 0;
    for (let i = 0; i < keys.length; i++) {
      if (match.groups[`t${i}`] !== undefined) { termIdx = i; break; }
    }
    found.push({ start, end, termIdx });
  }
  return found;
}

function highlightTextNode(textNode, matcher, colors) {
  const { keys } = matcher;
  const text = textNode.nodeValue;
  const matches = findMatches(text, matcher);
  if (matches.length === 0) return false;

  const frag = document.createDocumentFragment();
  let lastIndex = 0;

  for (const { start, end, termIdx } of matches) {
    const full = text.slice(start, end);

    if (start > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    const mark = document.createElement("mark");
    mark.className = HUEMARK_CLASS;
    mark.setAttribute(HUEMARK_ATTR, keys[termIdx]);
    // Dark-mode extensions (Dark Reader, etc.) repaint page colors, often
    // via injected stylesheet rules or a page-wide invert filter. !important
    // wins over an injected stylesheet rule targeting `mark`, and forced-
    // color-adjust/color-scheme tell the browser's own native dark theming
    // (and extensions that respect it) to leave this element's colors alone.
    // A filter-based invert on the whole page can still shift the hue -
    // that's a platform limitation, not something an element style can stop.
    const bg = colors.get(keys[termIdx]) || "#ffff00";
    mark.style.cssText =
      `background-color: ${bg} !important;` +
      `color: ${textColorFor(bg)} !important;` +
      `forced-color-adjust: none;` +
      `color-scheme: light;`;
    mark.textContent = full;
    frag.appendChild(mark);

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(frag, textNode);
  return true;
}

// ---------------------------------------------------------------------
// CSS Custom Highlight engine. The default engine wraps every match in a
// <mark>, which edits the page's DOM - and frameworks that keep references
// to their text nodes (React, Vue, ...) can break when those nodes are split
// or replaced. This engine leaves the DOM alone: each match is a Range painted
// through CSS.highlights and ::highlight(). content.js switches to it for
// pages where <mark>s don't survive (see setEngine). Limits: ::highlight can
// only paint colors/underlines, so the current match gets a thick underline
// instead of the <mark> engine's outline.
// ---------------------------------------------------------------------

let engine = "mark";
const cssSupported = typeof Highlight === "function" && typeof CSS !== "undefined" &&
  !!CSS.highlights && typeof CSSStyleSheet !== "undefined" && typeof Document !== "undefined" && "adoptedStyleSheets" in Document.prototype;

// What content.js uses in place of a <mark> element: same surface (attribute,
// rect, scroll, closest, ...) over a Range inside one text node.
class RangeMatch {
  constructor(node, range, key, color, name) {
    this.node = node; // the text node, stable even after the range collapses
    this.range = range;
    this.key = key;
    this.color = color;
    this.name = name;
    this.style = { backgroundColor: color };
  }
  get isConnected() { return this.node.isConnected && !this.range.collapsed; }
  get textContent() { return this.range.toString(); }
  get parentElement() { return parentElementOf(this.node); }
  closest(selector) { return this.parentElement?.closest(selector) || null; }
  getAttribute(name) { return name === HUEMARK_ATTR ? this.key : null; }
  getBoundingClientRect() { return this.range.getBoundingClientRect(); }
  scrollIntoView(opts = {}) { scrollRangeToCenter(this.range, opts.behavior || "auto"); }
  setCurrent(on) {
    const h = highlightFor("huemark-current", 10);
    if (on) h.add(this.range); else h.delete(this.range);
  }
}

const cssHighlights = new Map(); // name -> Highlight
const allMatches = new Set(); // every live RangeMatch
const nodeMatches = new WeakMap(); // text node -> its RangeMatch[]
let highlightSheet = null;
let sheetSignature = "";

function highlightFor(name, priority = 0) {
  let h = cssHighlights.get(name);
  if (!h) {
    h = new Highlight();
    h.priority = priority;
    cssHighlights.set(name, h);
    CSS.highlights.set(name, h);
  }
  return h;
}

// ::highlight() rules only apply in the tree scope of the stylesheet, so the
// one constructed sheet is adopted by the document and by every shadow root.
function adoptSheet(root) {
  if (!highlightSheet || root.adoptedStyleSheets.includes(highlightSheet)) return;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, highlightSheet];
}

function syncHighlightStyles(keys, colors) {
  const sig = keys.map((k) => `${k}=${colors.get(k)}`).join("|");
  if (highlightSheet && sig === sheetSignature) {
    // Pages that reassign adoptedStyleSheets drop our sheet; re-adopt it (cheap no-op when still present).
    adoptSheet(document);
    shadowRoots.forEach(adoptSheet);
    return;
  }
  sheetSignature = sig;
  const rules = keys.map((k, i) => {
    const bg = colors.get(k) || "#ffff00";
    return `::highlight(huemark-t${i}) { background-color: ${bg}; color: ${textColorFor(bg)}; }`;
  });
  rules.push("::highlight(huemark-current) { text-decoration: underline; text-decoration-thickness: 3px; text-decoration-color: #1a73e8; }");
  if (!highlightSheet) highlightSheet = new CSSStyleSheet();
  highlightSheet.replaceSync(rules.join("\n"));
  adoptSheet(document);
  shadowRoots.forEach(adoptSheet);
}

function removeMatch(m) {
  cssHighlights.get(m.name)?.delete(m.range);
  cssHighlights.get("huemark-current")?.delete(m.range);
  allMatches.delete(m);
  const list = nodeMatches.get(m.node);
  if (list) {
    const i = list.indexOf(m);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) nodeMatches.delete(m.node);
  }
}

// Matches whose text was removed from the page collapse to nothing; forget them.
function pruneMatches() {
  for (const m of [...allMatches]) {
    if (!m.isConnected) removeMatch(m);
  }
}

function highlightTextNodeCss(textNode, matcher, colors) {
  (nodeMatches.get(textNode) || []).slice().forEach(removeMatch); // rescan replaces, never stacks
  const found = findMatches(textNode.nodeValue, matcher);
  if (found.length === 0) return false;
  const list = [];
  for (const { start, end, termIdx } of found) {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const key = matcher.keys[termIdx];
    const name = `huemark-t${termIdx}`;
    const m = new RangeMatch(textNode, range, key, colors.get(key) || "#ffff00", name);
    highlightFor(name).add(range);
    allMatches.add(m);
    list.push(m);
  }
  nodeMatches.set(textNode, list);
  return true;
}

// Scrolls every scrollable ancestor (hopping out of shadow trees) and then the
// window so the range sits in the middle - Range has no scrollIntoView.
function scrollRangeToCenter(range, behavior) {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const chain = [];
  let el = parentElementOf(range.startContainer);
  while (el) {
    if (el !== document.documentElement && el !== document.body && el.scrollHeight > el.clientHeight &&
        /auto|scroll|overlay/.test(getComputedStyle(el).overflowY)) {
      chain.push(el);
    }
    el = el.parentElement || (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host : null);
  }
  let centerY = rect.top + rect.height / 2;
  chain.forEach((c, i) => {
    const box = c.getBoundingClientRect();
    // only the outermost scroller animates; inner ones must settle first
    c.scrollBy({ top: centerY - (box.top + box.height / 2), behavior: i === chain.length - 1 ? behavior : "instant" });
    centerY = box.top + box.height / 2;
  });
  window.scrollBy({ top: centerY - window.innerHeight / 2, behavior });
}

// Switches the highlighting engine, dropping the old engine's highlights
// first. The caller re-highlights afterwards. false = engine unavailable.
function setEngine(name) {
  if (name === engine) return true;
  if (name === "css" && !cssSupported) return false;
  clearHighlights(document.body);
  engine = name;
  return true;
}

const getEngine = () => engine;

function highlightNode(node, matcher, colors) {
  return engine === "css" ? highlightTextNodeCss(node, matcher, colors) : highlightTextNode(node, matcher, colors);
}

function highlight(root, terms, options = {}) {
  const matcher = buildMatcher(terms, !!options.wholeWord);
  if (!matcher) return 0;
  const colors = colorsByKey(terms);
  if (engine === "css") syncHighlightStyles(matcher.keys, colors);

  const textNodes = collectTextNodes(root);
  let count = 0;
  for (const node of textNodes) {
    if (!node.parentNode) continue; // may have been detached by an earlier replace
    if (highlightNode(node, matcher, colors)) count++;
  }
  return count;
}

// Highlights a specific set of already-known text nodes directly, skipping
// the TreeWalker over their containing subtree - used when the caller
// already knows exactly which nodes changed (e.g. a characterData mutation)
// rather than having to rescan a whole subtree to find them.
function highlightNodes(textNodes, terms, options = {}) {
  const matcher = buildMatcher(terms, !!options.wholeWord);
  if (!matcher) return 0;
  const colors = colorsByKey(terms);
  if (engine === "css") syncHighlightStyles(matcher.keys, colors);

  let count = 0;
  for (const node of textNodes) {
    if (!node.parentNode || !node.isConnected) continue;
    if (!isHighlightable(node)) continue;
    if (highlightNode(node, matcher, colors)) count++;
  }
  return count;
}

// Whether node is root or sits somewhere under it, hopping out of shadow trees
// through their hosts (root.contains() alone stops at the shadow boundary).
function isWithin(node, root) {
  while (node) {
    if (root.contains(node)) return true;
    const top = node.getRootNode();
    node = top.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? top.host : null;
  }
  return false;
}

// <mark>s this script took out itself, so content.js can tell them apart from
// ones the page removed (a sign the page fights the <mark> engine).
const ownRemovals = new WeakSet();
const wasRemovedByUs = (node) => ownRemovals.has(node);

function clearHighlights(root) {
  if (engine === "css") {
    for (const m of [...allMatches]) {
      if (!m.node.isConnected || isWithin(m.node, root)) removeMatch(m);
    }
    return;
  }
  const trees = [root];
  for (const sr of liveShadowRoots()) {
    if (isWithin(sr.host, root)) trees.push(sr);
  }
  const parents = new Set();
  for (const tree of trees) {
    for (const mark of tree.querySelectorAll(`.${HUEMARK_CLASS}`)) {
      const parent = mark.parentNode;
      if (!parent) continue;
      ownRemovals.add(mark);
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parents.add(parent);
    }
  }
  // normalize() merges adjacent text nodes back together - only needs to run
  // once per parent even if it had several marks removed from it.
  parents.forEach((parent) => parent.normalize());
}

// Every <mark> HueMark made under root (default: the document), shadow trees
// included, in reading order: a shadow tree's marks sit where its host is.
function queryMarks(root = document) {
  let own;
  if (engine === "css") {
    if (root === document) pruneMatches();
    own = [...allMatches].filter((m) => m.node.getRootNode() === root);
    own.sort((a, b) => a.range.compareBoundaryPoints(Range.START_TO_START, b.range));
  } else {
    own = [...root.querySelectorAll(`.${HUEMARK_CLASS}`)];
  }
  const groups = [];
  for (const sr of liveShadowRoots()) {
    if (sr.host.getRootNode() !== root) continue;
    const inner = queryMarks(sr);
    if (inner.length > 0) groups.push({ at: sr.host, marks: inner });
  }
  if (groups.length === 0) return own;
  const items = own.map((mark) => ({ at: mark.node || mark, marks: [mark] })).concat(groups);
  items.sort((a, b) => {
    if (a.at === b.at) return 0; // several matches in one text node keep their order
    return a.at.compareDocumentPosition(b.at) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  return items.flatMap((item) => item.marks);
}

// Exposed for content.js
window.__huemark = {
  highlight, highlightNodes, clearHighlights, queryMarks, onShadowRoot, isValidTerm, HUEMARK_CLASS,
  setEngine, getEngine, cssSupported, wasRemovedByUs
};
