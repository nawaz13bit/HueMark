// Export of the current matches with surrounding context, as Markdown.
// collect() reads the highlighted <mark> elements of this document (web page
// or the bundled PDF.js viewer); toMarkdown() is pure and also loaded by the
// popup. Needs window.__huemark (highlighter.js) only for collect().
(() => {
  if (window.__huemarkExporterLoaded) return;
  window.__huemarkExporterLoaded = true;

  const CONTEXT_CHARS = 70;
  const MAX_PER_TERM = 500;
  const MAX_BLOCK = 6000; // longest text kept per match for sentence/paragraph mode
  const PARA_CAP = 1500; // longer paragraphs are cut down to the sentence around the match
  // PDF text layers sometimes carry replacement/control characters from broken font encodings.
  const UNREADABLE = /[�\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
  // Bullets and non-breaking spaces become plain spaces, so context reads cleanly.
  const NOISE = /[ •⁃▪●⦁❖]/g;
  const BLOCK = "p,li,td,th,dd,dt,blockquote,h1,h2,h3,h4,h5,h6,pre,figcaption,div,section,article,summary";
  const AUX = 'nav, aside, footer, [role="navigation"], [role="complementary"], [role="doc-bibliography"], [role="doc-endnotes"], .references, #references, .reflist, .refbegin, .navbox, .vertical-navbox, .sidebar, .citation, .mw-references-wrap, .toc, #toc, .mw-editsection, .hatnote, #similar, #citedby-articles, #citedby, .similar-articles, .related-articles, .bibliography, .linked-articles, [role="dialog"]:not(:has(article, main)), [aria-modal="true"]:not(:has(article, main))';
  // Cookie/consent banner text: legal boilerplate, not the document's words.
  const CONSENT = /\b(?:accept(?: all)? cookies|we use cookies|cookie (?:settings|preferences)|manage (?:your )?cookies)\b/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Cut `context` characters either side of [start, end), on word boundaries.
  function snippet(full, start, end) {
    let a = Math.max(0, start - CONTEXT_CHARS);
    let b = Math.min(full.length, end + CONTEXT_CHARS);
    if (a > 0) { const sp = full.indexOf(" ", a); if (sp !== -1 && sp < start) a = sp + 1; }
    if (b < full.length) { const sp = full.lastIndexOf(" ", b); if (sp > end) b = sp; }
    // Never cut inside a surrogate pair (no space nearby, e.g. CJK or emoji runs).
    if (a > 0 && a < start && /[\uDC00-\uDFFF]/.test(full[a]) && /[\uD800-\uDBFF]/.test(full[a - 1])) a++;
    if (b < full.length && b > end && /[\uDC00-\uDFFF]/.test(full[b]) && /[\uD800-\uDBFF]/.test(full[b - 1])) b--;
    return {
      before: full.slice(a, start), hit: full.slice(start, end), after: full.slice(end, b),
      cutL: a > 0, cutR: b < full.length,
    };
  }

  // ---- web pages ----------------------------------------------------------
  // Text of one block element with whitespace collapsed, plus where each raw
  // text node starts in it (so a mark can be located exactly, even when the
  // same word occurs several times in the block).
  // Footnote / citation markers such as <sup>[7]</sup> or [clarification needed]: not part of
  // the author's sentence, and their brackets break sentence splitting.
  const noteCache = new WeakMap();
  function isNoteMarker(el) {
    const sup = el && el.closest("sup");
    if (!sup) return false;
    let v = noteCache.get(sup);
    if (v === undefined) {
      v = /^\[[^\]]{1,40}\]$/.test(sup.textContent.trim()) || sup.matches('[role="doc-noteref"], .reference');
      noteCache.set(sup, v);
    }
    return v;
  }
  const inlineDisplay = (el) => !el || /^inline$/.test(getComputedStyle(el).display);

  function blockModel(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(n.parentElement?.tagName || "") || isNoteMarker(n.parentElement)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const starts = new Map();
    let raw = "";
    let prevBlock = null;
    let prevEl = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const nb = n.parentElement && n.parentElement.closest(BLOCK);
      if (prevBlock && nb !== prevBlock) raw += " ";
      else if (prevEl && n.parentElement !== prevEl && raw && !/\s$/.test(raw) && /^[^\s]/.test(n.nodeValue)
        && !n.parentElement.closest("sub,sup") && !prevEl.closest("sub,sup")) { // "NH<sub>3</sub>" stays glued
        // "<span>Title:</span>Text" renders with a gap (label styling) but has no space in the DOM.
        if (/\p{L}[:;]$/u.test(raw) && /^\p{L}/u.test(n.nodeValue)) raw += " ";
        else if (/[\p{L}\p{N}]$/u.test(raw) && /^[\p{L}\p{N}]/u.test(n.nodeValue) && !(inlineDisplay(prevEl) && inlineDisplay(n.parentElement))) raw += " ";
      }
      prevEl = n.parentElement;
      prevBlock = nb;
      starts.set(n, raw.length);
      raw += n.nodeValue;
    }
    return { ...collapse(raw), starts };
  }

  // Collapses whitespace, remembering raw -> collapsed index.
  // joinHyphens (PDF text): "consti- tution" -> "constitution" (a line-break hyphen), but not
  // "pre- and post-" (next word is a conjunction) or a capitalised/numeric continuation.
  const HYPH_KEEP = /^(?:and|or|to|und|oder|et|ou|y|o|e|ed|of|the)(?!\p{L})/iu;
  const HYPHENS = /[-‐‑­]/;
  function collapse(raw, joinHyphens) {
    const map = new Array(raw.length + 1);
    let text = "";
    let lastSpace = true; // drops leading whitespace
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (joinHyphens && HYPHENS.test(ch) && i > 0 && /\p{L}/u.test(raw[i - 1])) {
        let j = i + 1;
        while (j < raw.length && /\s/.test(raw[j])) j++;
        // collectPdf puts 1 space after each item and 1 more after each line: only a >=2 run is a line break.
        if (j >= i + 3 && j < raw.length && /\p{Ll}/u.test(raw[j]) && !HYPH_KEEP.test(raw.slice(j, j + 4))) {
          for (let k = i; k < j; k++) map[k] = text.length;
          i = j - 1;
          continue;
        }
      }
      // Fast path for the common ASCII cases; the regex only runs for other code points.
      const c = ch.charCodeAt(0);
      const ws = c === 32 || (c >= 9 && c <= 13) || (c > 127 && /\s/.test(ch));
      if (ws) {
        map[i] = text.length;
        if (!lastSpace) { text += " "; lastSpace = true; }
      } else { map[i] = text.length; text += ch; lastSpace = false; }
    }
    map[raw.length] = text.length;
    return { text, map };
  }

  // Registers the text a match sits in, for the sentence/paragraph modes, and
  // returns { blk, bs, be }: its index in `blocks` and the match's offsets in
  // it. Oversized blocks are cut to a window around the match.
  function blockRef(blocks, model, start, end) {
    const text = model.text;
    if (text.length <= MAX_BLOCK) {
      if (model.blk === undefined) model.blk = blocks.push(text) - 1;
      return { blk: model.blk, bs: start, be: end };
    }
    const a = Math.max(0, start - MAX_BLOCK / 2);
    const b = Math.min(text.length, end + MAX_BLOCK / 2);
    return { blk: blocks.push(text.slice(a, b)) - 1, bs: start - a, be: end - a };
  }

  // Nearest heading above a node, for the research and resume presets.
  function headingFinder() {
    const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => h.textContent.trim());
    return (node) => {
      // A node inside a shadow root is "disconnected" from light-DOM headings: compare via its outermost host.
      for (let r = node.getRootNode && node.getRootNode(); r && r.host; r = node.getRootNode()) node = r.host;
      let lo = 0;
      let hi = hs.length - 1;
      let best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (hs[mid].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return best < 0 ? "" : hs[best].textContent.replace(/\s+/g, " ").trim().slice(0, 80);
    };
  }

  // Sections that list things rather than say them.
  const AUX_HEADING = /^(?:external links|see also|further reading|references|notes|footnotes|bibliography|citations|sources|related (?:articles|links|content|topics)|contents|navigation|menu|share|follow us|more (?:from|stories))$/i;
  // A field label ("Title:", "Authors:", a <dt>/<th>/<label> cell) or a block that is nearly all
  // link text with no sentence in it (menus, link lists, "Related" strips): not prose to quote.
  function isLabelOrLinkList(host, block, text) {
    if (host.closest("dt, th, label, legend, summary, button, [role=\"tab\"], [role=\"menuitem\"], .infobox, .infobox-label")) return true;
    if (host.closest("h1, h2, h3, h4, h5, h6, figcaption, caption")) return true;
    if (text.length <= 40 && /[:：]$/.test(text.trim())) return true;
    // "<span class=descriptor>Title:</span> Attention Is All You Need": the match sits in the label.
    const own = host.textContent.trim();
    if (own.length <= 40 && /[:：]$/.test(own) && own.length < text.length) return true;
    if (/[.!?…][”"')\]]?(\s|$)/.test(text) && text.length > 60) return false; // reads as a sentence
    const linked = [...block.querySelectorAll("a")].reduce((n, a) => n + a.textContent.length, 0);
    return text.length > 0 && linked / text.length > 0.8 && !!host.closest("a, li");
  }

  function collectWeb(marks, blocks) {
    const rows = [];
    const cache = new Map();
    const headOf = headingFinder();
    for (const m of marks) {
      const block = m.closest(BLOCK) || m.parentElement || document.body;
      let model = cache.get(block);
      if (!model) { model = blockModel(block); cache.set(block, model); }
      let rawStart;
      if (m.range) { // CSS Highlight engine: the match is a Range inside one text node
        const base = model.starts.get(m.range.startContainer);
        rawStart = base === undefined ? undefined : base + m.range.startOffset;
      } else {
        const first = document.createTreeWalker(m, NodeFilter.SHOW_TEXT).nextNode();
        rawStart = first ? model.starts.get(first) : undefined;
      }
      if (rawStart === undefined || !m.textContent) continue;
      const rawEnd = rawStart + m.textContent.length;
      const start = model.map[rawStart];
      const end = Math.max(start + 1, model.map[Math.min(rawEnd, model.map.length - 1)]);
      const stop = Math.min(end, model.text.length);
      const row = {
        term: m.getAttribute("data-huemark-term"), heading: headOf(m.range ? m.range.startContainer : m),
        ...snippet(model.text, start, stop), ...blockRef(blocks, model, start, stop),
      };
      // Navigation, sidebars, reference and "similar articles" lists: not the document's own words.
      // parentElement is null for text sitting directly under a shadow root.
      const host = (m.range ? m.range.startContainer.parentElement : m) || block;
      if (host.closest(AUX) || AUX_HEADING.test(row.heading) || (model.text.length < 900 && CONSENT.test(model.text)) || isLabelOrLinkList(host, block, model.text)) row.aux = 1;
      rows.push(row);
    }
    return rows;
  }

  // ---- PDF.js viewer ------------------------------------------------------
  const isPdfViewer = () => !!document.getElementById("viewer") && !!window.PDFViewerApplication;

  const pageRendered = (n) => {
    const layer = document.querySelector(`#viewer .page[data-page-number="${n}"] .textLayer`);
    return !!layer && (layer.querySelector("span") || layer.querySelector(".endOfContent"));
  };

  // Resolves when page n's text layer is built: on PDF.js's "textlayerrendered" event (fires after the
  // spans exist), with a slow poll as a fallback and `ms` as the give-up limit.
  function textLayerReady(app, n, ms) {
    return new Promise((resolve) => {
      const bus = app.eventBus;
      let timer = 0;
      let poll = 0;
      const done = () => {
        clearTimeout(timer);
        clearInterval(poll);
        if (bus && bus.off) bus.off("textlayerrendered", onEvent);
        resolve();
      };
      const onEvent = (e) => { if (!e || e.pageNumber === n) done(); };
      if (bus && bus.on) bus.on("textlayerrendered", onEvent);
      timer = setTimeout(done, ms);
      poll = setInterval(() => { if (pageRendered(n)) done(); }, 100);
    });
  }

  // PDF.js only builds text layers for pages near the viewport, so step
  // through every page, then put the user back where they were.
  async function renderAllPdfPages() {
    const app = window.PDFViewerApplication;
    const total = app.pagesCount || 0;
    const container = document.getElementById("viewerContainer");
    const origPage = app.page;
    const origTop = container ? container.scrollTop : 0;
    // A hidden tab never builds text layers: don't spend 3 s per page finding that out.
    const perPage = document.hidden ? 300 : 3000;
    for (let p = 1; p <= total; p++) {
      if (pageRendered(p)) continue;
      app.page = p;
      await textLayerReady(app, p, perPage);
    }
    app.page = origPage;
    if (container) container.scrollTop = origTop;
    // Let the highlighter's observer mark the new text layers. (A "mark count holds still" check was tried:
    // the count sat at 0 while the observer was still working, so it ended too early and the export found nothing.)
    await sleep(700);
    return total;
  }

  // Text lines of one PDF.js text layer, top to bottom, each with its spans left to right.
  function pdfLines(layer) {
    // Leaf spans only: tagged PDFs wrap the text spans in span.markedContent.
    const items = [...layer.querySelectorAll("span")]
      .filter((s) => !s.querySelector("span") && s.textContent !== "")
      .map((el) => { const r = el.getBoundingClientRect(); return { el, y: r.top + r.height / 2, h: r.height, x: r.left }; })
      .filter((i) => i.h > 0);
    items.sort((p, q) => (Math.abs(p.y - q.y) > Math.min(p.h, q.h) * 0.5 ? p.y - q.y : p.x - q.x));
    const lines = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.min(last.h, it.h) * 0.5) last.items.push(it);
      else lines.push({ y: it.y, h: it.h, items: [it] });
    }
    return lines;
  }

  // A line that looks like a section title: a known resume/paper heading, or a short ALL-CAPS line.
  const SECTION = /^(?:(?:work |professional |relevant |employment |teaching |research )?(?:experience|history)|employment|education(?: and training)?|(?:technical |core |key )?skills(?: and [a-z ]+)?|projects?|certifications?|licen[sc]es|summary|(?:professional )?profile|objective|publications?|awards?|honou?rs|achievements?|languages|interests|references|volunteer(?:ing)?(?: experience)?|abstract|introduction|background|methods?|methodology|results|discussion|conclusions?|references|bibliography|works cited|literature cited|acknowledg(?:e)?ments|appendix)$/i;
  // Matches under these headings are reference-list entries, not the document's own prose.
  const REFS_HEADING = /^(?:references|bibliography|works cited|literature cited)$/i;
  function sectionTitle(ln) {
    const text = ln.items.slice().sort((p, q) => p.x - q.x).map((i) => i.el.textContent).join(" ").replace(/\s+/g, " ").trim();
    const bare = text.replace(/[:：]$/, "").replace(/^\d+(\.\d+)*\.?\s+/, "");
    if (!bare || bare.length > 40) return "";
    if (SECTION.test(bare)) return bare;
    return /^[A-Z][A-Z &/,'-]{2,}$/.test(bare) && bare.split(" ").length <= 4 ? bare : "";
  }

  // A short line with no lowercase letters ("BOARD OF EDUCATION.", "II. THE FACTS"): a heading, not prose.
  function isHeadingLine(ln) {
    const t = ln.items.map((i) => i.el.textContent).join(" ").replace(/\s+/g, " ").trim();
    return t.length >= 4 && t.length <= 60 && t.split(" ").length <= 8 && /\p{Lu}.*\p{Lu}/u.test(t) && !/\p{Ll}/u.test(t);
  }

  function collectPdf(marks, blocks) {
    const rows = [];
    // Headings carry across pages; scanning pages that hold no match is only done for short documents.
    const scanAll = (window.PDFViewerApplication.pagesCount || 0) <= 12;
    let curHeading = "";
    // Bucket marks by page once (instead of testing every mark against every page).
    const byPage = new Map();
    for (const m of marks) {
      const n = m.node || m;
      const pg = (n.nodeType === 1 ? n : n.parentElement)?.closest(".page");
      if (pg) { const l = byPage.get(pg); if (l) l.push(m); else byPage.set(pg, [m]); }
    }
    for (const page of document.querySelectorAll("#viewer .page")) {
      const pageNo = Number(page.dataset.pageNumber);
      const layer = page.querySelector(".textLayer");
      const pageMarks = layer ? (byPage.get(page) || []).filter((m) => layer.contains(m.node || m)) : [];
      if (!pageMarks.length) {
        // Long documents: only the back 40% is scanned, to catch a References heading.
        const tail = pageNo > (window.PDFViewerApplication.pagesCount || 0) * 0.6;
        if ((scanAll || tail) && layer) for (const ln of pdfLines(layer)) curHeading = sectionTitle(ln) || curHeading;
        continue;
      }
      const lines = pdfLines(layer);
      const headAt = lines.map((ln) => { curHeading = sectionTitle(ln) || curHeading; return curHeading; });
      let full = "";
      const lineAt = [];
      const lineStarts = [];
      const offsets = new Map();
      const textBase = new Map(); // text node -> offset in `full` (range matches)
      lines.forEach((ln, li) => {
        ln.items.sort((p, q) => p.x - q.x);
        const lineStart = full.length;
        lineStarts[li] = lineStart;
        for (const it of ln.items) {
          const walker = document.createTreeWalker(it.el, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const mk = n.parentElement && n.parentElement.closest(".huemark-highlight");
            const start = full.length;
            textBase.set(n, start);
            full += n.nodeValue;
            if (mk) { const o = offsets.get(mk); offsets.set(mk, o ? [o[0], full.length] : [start, full.length]); }
          }
          full += " ";
        }
        full += " ";
        for (let i = lineStart; i < full.length; i++) lineAt[i] = li + 1;
      });
      // Same-length cleanup keeps the offsets valid; extra spaces are squeezed per snippet.
      const flat = full.replace(NOISE, " ");
      // A PDF has no paragraphs, only lines: a gap clearly wider than the usual
      // line spacing starts a new one.
      const paraOf = [];
      let para = 0;
      lines.forEach((ln, li) => {
        if (li && ln.y - lines[li - 1].y > Math.max(ln.h, lines[li - 1].h) * 1.65) para++;
        paraOf[li] = para;
      });
      const paraModels = new Map(); // paragraph number -> { start, text, map, blk }
      const paraModel = (n) => {
        let pm = paraModels.get(n);
        if (!pm) {
          const first = paraOf.indexOf(n);
          const last = paraOf.lastIndexOf(n);
          const start = lineStarts[first];
          const end = last + 1 < lines.length ? lineStarts[last + 1] : flat.length;
          pm = { start, end, ...collapse(flat.slice(start, end), true) };
          paraModels.set(n, pm);
        }
        return pm;
      };
      for (const m of pageMarks) {
        let o;
        if (m.range) {
          const base = textBase.get(m.range.startContainer);
          if (base !== undefined) o = [base + m.range.startOffset, base + m.range.endOffset];
        } else {
          o = offsets.get(m);
        }
        if (!o) continue;
        const row = {
          term: m.getAttribute("data-huemark-term"), page: pageNo, line: lineAt[o[0]],
          heading: headAt[lineAt[o[0]] - 1] || "", ...snippet(flat, o[0], o[1]),
        };
        // A match inside a heading line ("BOARD OF EDUCATION.") has no sentence worth quoting.
        const lnItems = lines[lineAt[o[0]] - 1];
        if (lnItems && isHeadingLine(lnItems)) row.aux = 1;
        const pm = lineAt[o[0]] ? paraModel(paraOf[lineAt[o[0]] - 1]) : null;
        if (pm) {
          const cut = (i) => pm.map[Math.min(Math.max(i - pm.start, 0), pm.map.length - 1)];
          const bs = cut(o[0]);
          const be = Math.max(bs + 1, cut(Math.min(o[1], pm.end)));
          Object.assign(row, blockRef(blocks, pm, bs, be));
          // Snippet mode reads the same hyphen-joined text as sentence/paragraph ("consti- tution" -> "constitution").
          if (pm.text.length <= MAX_BLOCK) Object.assign(row, snippet(pm.text, bs, Math.min(be, pm.text.length)));
        }
        // Papers only: a short document (a resume) can have a real "References" section.
        if (REFS_HEADING.test(row.heading) && (window.PDFViewerApplication.pagesCount || 0) > 4) continue;
        rows.push(row);
      }
    }
    return rows;
  }

  // ---- source metadata (for citations) --------------------------------------
  // Raw strings only (JSON-safe, travels through the background); parsed into
  // names and dates by the citation code. Scholarly <meta> tags (Highwire
  // "citation_*", Dublin Core) come first, then OpenGraph, then JSON-LD.
  const ORG = /\b(?:inc|ltd|llc|corp|company|university|college|institute|organi[sz]ation|association|committee|council|agency|department|ministry|foundation|center|centre|bureau|group|society|editors?|contributors|authority|commission)\b/i;

  function jsonLd() {
    const out = { authors: [], date: "", headline: "", publisher: "" };
    const nodes = [];
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      nodes.push(n);
      if (n["@graph"]) walk(n["@graph"]);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { walk(JSON.parse(s.textContent)); } catch (_) {}
    }
    const nameOf = (v) => (typeof v === "string" ? v : v && typeof v.name === "string" ? v.name : "");
    for (const n of nodes) {
      if (!/Article|Posting|WebPage|Report|ScholarlyArticle|NewsArticle|BlogPosting/i.test([].concat(n["@type"] || []).join(" "))) continue;
      if (!out.authors.length && n.author) out.authors = [].concat(n.author).map(nameOf).filter((x) => x && !/^https?:/i.test(x));
      if (!out.date) out.date = n.datePublished || n.dateCreated || "";
      if (!out.modified) out.modified = n.dateModified || "";
      if (!out.headline) out.headline = n.headline || "";
      if (!out.publisher) out.publisher = nameOf(n.publisher);
    }
    return out;
  }

  function webMeta() {
    const all = (sel) => [...document.querySelectorAll(sel)].map((n) => (n.getAttribute("content") || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const one = (...names) => {
      for (const n of names) { const v = all(`meta[name="${n}" i], meta[property="${n}" i], meta[itemprop="${n}" i]`)[0]; if (v) return v; }
      return "";
    };
    const many = (...names) => {
      for (const n of names) { const v = all(`meta[name="${n}" i], meta[property="${n}" i]`); if (v.length) return v; }
      return [];
    };
    const ld = jsonLd();
    let authors = many("citation_author", "dc.creator", "author").filter((a) => !/^https?:/i.test(a));
    // PubMed: one tag, "Polack FP;Thomas SJ;..."
    if (!authors.length) authors = many("citation_authors").flatMap((s) => s.split(/\s*;\s*/))
      .map((s) => s.replace(/^(.+?)\s+([A-Z]{1,4})$/, "$1, $2")).filter(Boolean); // "Polack FP" -> "Polack, FP"
    if (!authors.length) authors = many("article:author", "og:article:author").filter((a) => !/^https?:/i.test(a));
    if (!authors.length) authors = ld.authors;
    // Wikipedia pages are living documents: cite the revision date, under the site's name.
    const wiki = /(^|\.)wikipedia\.org$/.test(location.hostname);
    const doi = one("citation_doi", "dc.identifier.doi", "prism.doi") || (all('meta[name="dc.identifier" i]').find((v) => /10\.\d{4,9}\//.test(v)) || "");
    return {
      authors,
      title: one("citation_title", "dc.title", "og:title", "twitter:title") || ld.headline || "",
      date: (wiki && ld.modified) || one("citation_publication_date", "citation_date", "citation_online_date", "article:published_time", "og:article:published_time",
        "dc.date.issued", "dc.date", "date", "datePublished", "pubdate") || ld.date || "",
      site: wiki ? "Wikipedia" : one("og:site_name", "application-name") || ld.publisher || "",
      // First 3000 chars, plus the last 1200 for judgments that put the decision date/signature at the end
      // (Italian "Così deciso ... il 5 giugno 1956" sits ~950 chars before the page footer).
      head: (() => {
        const t = document.body && document.body.innerText || "";
        return t.length > 4200 ? `${t.slice(0, 3000)}\n${t.slice(-1200)}` : t.slice(0, 3000);
      })(),
      journal: one("citation_journal_title", "prism.publicationName"),
      journalAbbrev: one("citation_journal_abbrev"),
      volume: one("citation_volume", "prism.volume"),
      issue: one("citation_issue", "prism.number"),
      firstPage: one("citation_firstpage", "prism.startingPage"),
      lastPage: one("citation_lastpage", "prism.endingPage"),
      publisher: one("citation_publisher", "dc.publisher"),
      doi,
    };
  }

  // No usable /Title: use the largest-type text at the top of page 1 (a paper's or report's title).
  // Returns "" when nothing plausible is found, so the caller falls back to the file name.
  async function guessPdfTitle() {
    try {
      const page = await window.PDFViewerApplication.pdfDocument.getPage(1);
      const items = (await page.getTextContent()).items.filter((i) => i.str && i.str.trim() && i.height > 0);
      if (!items.length) return "";
      const top = Math.max(...items.map((i) => i.height));
      const body = items.map((i) => i.height).sort((a, b) => a - b)[items.length >> 1];
      if (top < body * 1.15) return ""; // no heading stands out
      const big = items.filter((i) => i.height >= top * 0.9);
      // Only the first block of large lines; stop at the first big gap down the page.
      const lines = [];
      let lastY = null;
      for (const i of big) {
        const y = i.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > top * 2.5) break;
        if (lastY === null || Math.abs(y - lastY) > top * 0.5) lines.push(i.str); else lines[lines.length - 1] += i.str;
        lastY = y;
      }
      const t = lines.join(" ").replace(/\s+/g, " ").trim();
      return t.length >= 4 && t.length <= 200 ? t : "";
    } catch (_) { return ""; }
  }

  async function pdfMeta() {
    let info = {};
    try { info = (await window.PDFViewerApplication.pdfDocument.getMetadata()).info || {}; } catch (_) {}
    // Word/LaTeX leave junk in /Title: file names, "Microsoft Word - x.docx", "untitled".
    let title = String(info.Title || "").trim();
    if (/^(untitled|microsoft word\b)|\.(docx?|tex|pdf|indd)$/i.test(title) || title.length < 3) title = "";
    if (!title) title = await guessPdfTitle();
    let head = "";
    try {
      const page = await window.PDFViewerApplication.pdfDocument.getPage(1);
      head = (await page.getTextContent()).items.map((i) => i.str).join(" ").slice(0, 3000);
    } catch (_) {}
    return {
      head,
      authors: info.Author ? [String(info.Author)] : [], title,
      date: String(info.CreationDate || ""), site: "", journal: "", volume: "", issue: "",
      firstPage: "", lastPage: "", publisher: "", doi: "",
    };
  }

  // The address of the document itself: for the bundled PDF viewer that is the ?file= PDF.
  function sourceUrl() {
    const m = /[?&]file=(.*)$/.exec(location.search);
    if (isPdfViewer() && m) {
      let f = m[1];
      if (!/^[a-z][a-z0-9+.-]*:/i.test(f)) { try { f = decodeURIComponent(f); } catch (_) {} }
      return f;
    }
    return location.href.replace(/#.*$/, "");
  }

  // ---- public -------------------------------------------------------------
  async function collect() {
    const pdf = isPdfViewer();
    let pages = 0;
    if (pdf) pages = await renderAllPdfPages();
    const scope = pdf ? document.getElementById("viewer") : null; // not the viewer toolbar
    const marks = window.__huemark.queryMarks().filter((m) => !scope || scope.contains(m.node || m));
    const blocks = [];
    const rows = pdf ? collectPdf(marks, blocks) : collectWeb(marks, blocks);    // Highlights exist but none could be located: the text layers have no layout (hidden tab). Say so, not "no matches".
    if (pdf && marks.length && !rows.length) throw new Error("PDF text layout unavailable");
    const hasText = pdf ? !!document.querySelector("#viewer .textLayer span") : true;
    const meta = pdf ? await pdfMeta() : webMeta();
    return {
      rows, blocks, isPdf: pdf, pages,
      scanned: pdf && pages > 0 && !hasText,
      title: (pdf && meta.title) || document.title || "",
      url: location.href,
      srcUrl: sourceUrl(),
      meta,
    };
  }

  // Synchronous variant for iframes: web pages only, no PDF stepping.
  function collectFrame() {
    const blocks = [];
    // head: the frame's own opening text, so a citation printed inside an iframe (SCC judgments) reaches the detectors.
    const t = document.body && document.body.innerText || "";
    return { rows: collectWeb(window.__huemark.queryMarks(), blocks), blocks, url: location.href, title: document.title || "", head: t.slice(0, 3000) };
  }

  const clean = (s) => s.replace(NOISE, " ").replace(UNREADABLE, "?").replace(/\s+/g, " ");
  const esc = (s) => s.replace(/([\\`*_{}\[\]<>|~])/g, "\\$1");
  // URLs go inside <...> autolinks: a literal < > or whitespace would end the link early.
  const mdUrl = (u) => String(u || "").replace(/[<>\s]/g, (c) => encodeURIComponent(c));

  // ---- sentences and paragraphs ---------------------------------------------
  // [start, end) of every sentence in `text`, trimmed; memoised per text.
  // Always a continuation: titles, initials ("J. Smith"), citation words ("Int. J.", "et al.", "v.").
  const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|v|Fig|Eq|e\.g|i\.e|cf|Int|Mt|approx|ca|a\.m|p\.m)\.\s*$/;
  // Single initials: "J. Smith", "U.S." but not "vitamin C." / "Hepatitis B." (a lowercase word before it).
  const INITIAL = /(?:^|[^\p{L}])\p{Lu}\.\s*$/u;
  const AFTER_LOWER = /(?:^|[^\p{L}])\p{Ll}\p{L}*\s+\p{Lu}\.\s*$/u;
  // Words that also end real sentences ("...Acme Inc. Patients"): a continuation only before a lowercase word or digit.
  const ABBREV_SOFT = /\b(?:Co|Corp|Inc|Ltd|Gen|Gov|Sen|Rep|Rev|Hon|Lt|Col|Capt|Dept|Univ|Ave|Blvd|et al)\.\s*$/;
  // A continuation only when a number follows: "Oct. 29", "No. 5", "p. 12", "Vol. 3".
  const ABBREV_NUM = /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|No|Nos|pp?|Vol|Sec|Art|Ch|ed|eds)\.\s*$/;
  const sentenceCache = new Map();
  function sentences(text) {
    let spans = sentenceCache.get(text);
    if (spans) return spans;
    spans = [];
    const push = (s, e) => {
      while (s < e && text[s] === " ") s++;
      while (e > s && text[e - 1] === " ") e--;
      if (e <= s) return;
      const prev = spans[spans.length - 1];
      // "Dr. Smith" is not two sentences.
      const ptxt = prev && text.slice(prev[0], prev[1]);
      const nxt = text.slice(s, e);
      if (prev && (ABBREV.test(ptxt) || (INITIAL.test(ptxt) && !AFTER_LOWER.test(ptxt))
        || (ABBREV_SOFT.test(ptxt) && /^[\p{Ll}\d]/u.test(nxt))
        || (ABBREV_NUM.test(ptxt) && /^\d/.test(nxt)))) prev[1] = e;
      else spans.push([s, e]);
    };
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      for (const seg of new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text)) {
        push(seg.index, seg.index + seg.segment.length);
      }
    } else {
      const re = /[^.!?。！？।]+(?:[.!?。！？।]+["')\]”’»]*(?:\s+|$)|$)/g;
      for (let m = re.exec(text); m; m = re.exec(text)) push(m.index, m.index + m[0].length);
    }
    if (!spans.length) spans.push([0, text.length]);
    if (sentenceCache.size > 2000) sentenceCache.clear();
    sentenceCache.set(text, spans);
    return spans;
  }

  // The text to show for one match in "sentence" or "paragraph" mode, with the
  // match's offsets in it. Rows from an older export without block data fall
  // back to their snippet.
  function passageOf(r, blocks, mode) {
    const full = blocks && blocks[r.blk];
    if (full === undefined) {
      return { text: r.before + r.hit + r.after, hs: r.before.length, he: r.before.length + r.hit.length, cutL: r.cutL, cutR: r.cutR };
    }
    let s = 0;
    let e = full.length;
    let cutL = false;
    let cutR = false;
    if (mode === "sentence" || e > PARA_CAP) {
      const sp = sentences(full).find((x) => r.bs < x[1]) || [0, full.length];
      s = sp[0];
      e = sp[1];
      cutL = mode === "paragraph" && s > 0;
      cutR = mode === "paragraph" && e < full.length;
      if (e - s > PARA_CAP) { // a "sentence" with no stops, e.g. a table or a code block
        s = Math.max(s, r.bs - PARA_CAP / 2);
        e = Math.min(e, r.be + PARA_CAP / 2);
        // Never cut inside a surrogate pair (emoji, rare CJK).
        if (s > 0 && /[\uDC00-\uDFFF]/.test(full[s]) && /[\uD800-\uDBFF]/.test(full[s - 1])) s++;
        if (e < full.length && /[\uDC00-\uDFFF]/.test(full[e]) && /[\uD800-\uDBFF]/.test(full[e - 1])) e--;
        cutL = cutL || s > sp[0];
        cutR = cutR || e < sp[1];
      }
    }
    return { text: full.slice(s, e), hs: Math.max(0, r.bs - s), he: Math.min(r.be, e) - s, cutL, cutR };
  }

  // Text with every hit in bold, hits merged where they overlap.
  function boldHits(text, hits) {
    const sorted = [...hits].sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const h of sorted) {
      const last = merged[merged.length - 1];
      if (last && h[0] < last[1]) last[1] = Math.max(last[1], h[1]);
      else merged.push([h[0], h[1]]);
    }
    let out = "";
    let pos = 0;
    for (const [s, e] of merged) {
      out += esc(clean(text.slice(pos, s))) + "**" + esc(clean(text.slice(s, e))) + "**";
      pos = e;
    }
    return (out + esc(clean(text.slice(pos)))).trim();
  }

  // data: { rows, blocks?, isPdf, scanned, title, url, frames?: [{ url, rows, blocks? }] }
  // terms: term strings in display order. labels: localized strings (see popup.js).
  // opts: { mode: "snippet" | "sentence" | "paragraph", club: boolean }. In the
  // sentence and paragraph modes a passage that holds several terms is listed
  // once under a combined "a + b" header when `club` is set, otherwise under
  // each of its terms.
  function toMarkdown(data, terms, labels, opts = {}) {
    const all = [...data.rows.map((r) => ({ ...r, frame: null, blocks: data.blocks }))];
    for (const f of data.frames || []) for (const r of f.rows) all.push({ ...r, frame: f.url, blocks: f.blocks });
    const mode = opts.mode === "sentence" || opts.mode === "paragraph" ? opts.mode : "snippet";
    const hasUnreadable = new RegExp(UNREADABLE.source);

    const groups = new Map(terms.map((t) => [t.toLowerCase(), []]));
    for (const r of all) {
      const k = (r.term || "").toLowerCase();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const display = new Map(terms.map((t) => [t.toLowerCase(), t]));
    const order = [...groups.keys()];

    // sections: { title, count, items: [{ loc, text, frame }] }
    const sections = [];
    let unreadable;
    let passageCount = 0;
    const locOf = (r) => (r.page ? `${labels.page}${r.page}, ${labels.line}${r.line}` : "");
    if (mode === "snippet") {
      unreadable = all.filter((r) => hasUnreadable.test(r.before + r.hit + r.after)).length;
      for (const [key, rows] of groups) {
        sections.push({
          title: esc(display.get(key) || key),
          count: rows.length,
          items: rows.slice(0, MAX_PER_TERM).map((r) => {
            const before = esc(clean(r.before)).replace(/^ /, "");
            const after = esc(clean(r.after)).replace(/ $/, "");
            return { loc: locOf(r), frame: r.frame, text: `${r.cutL ? "…" : ""}${before}**${esc(clean(r.hit))}**${after}${r.cutR ? "…" : ""}` };
          }),
        });
      }
    } else {
      // One passage per distinct text; every match inside it adds its term and its bold range.
      const passages = new Map();
      for (const r of all) {
        const p = passageOf(r, r.blocks, mode);
        const id = `${r.frame || ""}\u0000${r.page || 0}\u0000${p.text}`;
        let entry = passages.get(id);
        if (!entry) {
          entry = { ...p, loc: locOf(r), frame: r.frame, keys: new Set(), hits: new Map() };
          passages.set(id, entry);
        }
        entry.keys.add((r.term || "").toLowerCase());
        entry.hits.set(`${p.hs}:${p.he}`, [p.hs, p.he]);
      }
      passageCount = passages.size;
      unreadable = [...passages.values()].filter((p) => hasUnreadable.test(p.text)).length;
      const itemOf = (p) => ({
        loc: p.loc, frame: p.frame,
        text: `${p.cutL ? "…" : ""}${boldHits(p.text, p.hits.values())}${p.cutR ? "…" : ""}`,
      });
      const bySet = new Map(); // "a\0b" -> { keys: [ordered term keys], list: [passage] }
      for (const p of passages.values()) {
        const keys = order.filter((k) => p.keys.has(k));
        if (opts.club) {
          const id = keys.join("\u0000");
          if (!bySet.has(id)) bySet.set(id, { keys, list: [] });
          bySet.get(id).list.push(p);
        } else {
          for (const k of keys) {
            if (!bySet.has(k)) bySet.set(k, { keys: [k], list: [] });
            bySet.get(k).list.push(p);
          }
        }
      }
      // Single terms first, in list order (empty ones too, so "no matches" shows); then
      // combined headers, fewest terms first.
      // A term whose matches all sit in combined passages has no section of its own.
      const entries = order
        .map((k) => bySet.get(k) || { keys: [k], list: [] })
        .filter((e) => e.list.length || !groups.get(e.keys[0]).length);
      const combos = [...bySet.values()].filter((e) => e.keys.length > 1).sort((a, b) => {
        if (a.keys.length !== b.keys.length) return a.keys.length - b.keys.length;
        for (let i = 0; i < a.keys.length; i++) {
          const d = order.indexOf(a.keys[i]) - order.indexOf(b.keys[i]);
          if (d) return d;
        }
        return 0;
      });
      for (const e of [...entries, ...combos]) {
        sections.push({
          title: e.keys.map((k) => esc(display.get(k) || k)).join(" + "),
          count: e.list.length,
          items: e.list.slice(0, MAX_PER_TERM).map(itemOf),
        });
      }
    }

    let md = `# ${labels.title}: ${esc(clean(data.title).trim() || data.url)}\n\n`;
    md += `- **${labels.source}:** <${mdUrl(data.url)}>\n`;
    md += `- **${labels.exported}:** ${new Date().toISOString().slice(0, 10)}\n`;
    md += `- **${labels.terms}:** ${terms.map((t) => "`" + t.replace(/`/g, "'") + "`").join(", ")}\n`;
    md += `- **${labels.matches}:** ${all.length}\n`;
    if (mode !== "snippet") md += `- **${labels.passages}:** ${passageCount}\n`;
    if (data.scanned) md += `\n> ${labels.scanned}\n`;
    if (unreadable) md += `\n> ${labels.unreadable.replace("{n}", String(unreadable))}\n`;

    for (const sec of sections) {
      md += `\n## ${sec.title} (${sec.count})\n\n`;
      if (!sec.count) { md += `_${labels.none}_\n`; continue; }
      for (const it of sec.items) {
        md += `- ${it.loc ? `*${it.loc}* — ` : ""}${it.text}${it.frame ? ` (<${mdUrl(it.frame)}>)` : ""}\n`;
      }
      if (sec.count > MAX_PER_TERM) md += `- _… ${sec.count - MAX_PER_TERM} ${labels.more}_\n`;
    }
    return md;
  }

  // ---- citations --------------------------------------------------------------
  // toCitations() turns the matches into verbatim quotes, each followed by an in-text
  // marker in the chosen style, and one reference entry for the source. Style rules are
  // the common core of each guide, not every edge case (see the limits in the README).
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const M_DOT = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."]; // MLA, Bluebook
  const M_IEEE = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
  const M_3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; // Vancouver
  const CITE_STYLES = ["apa", "mla", "chicago", "harvard", "ieee", "vancouver", "ama", "bluebook", "oscola", "mcgill", "aglc", "india", "de", "at", "ch", "fr", "it", "es", "eu", "br", "pt", "jp", "kr", "cn", "ru", "ar", "ag", "mx", "co", "plain"];
  const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹";

  function parseDate(s) {
    s = String(s || "").trim();
    if (!s) return null;
    const m = /^D:(\d{4})(\d{2})?(\d{2})?/.exec(s) || /^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?(?:\D|$)/.exec(s);
    if (m) {
      const y = +m[1];
      const mo = +m[2] >= 1 && +m[2] <= 12 ? +m[2] : 0;
      const d = mo && +m[3] >= 1 && +m[3] <= 31 ? +m[3] : 0;
      return y >= 1000 && y <= 2999 ? { y, m: mo, d } : null;
    }
    // "03/04/2020" is 3 April or March 4 depending on the locale: keep only the year unless one
    // number can only be a day (>12).
    const nm = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\D|$)/.exec(s);
    if (nm) {
      const a = +nm[1];
      const b = +nm[2];
      const y = +nm[3];
      if (y < 1000 || y > 2999) return null;
      if (a === b && a >= 1 && a <= 12) return { y, m: a, d: b };
      if (a > 12 && b >= 1 && b <= 12) return { y, m: b, d: a <= 31 ? a : 0 };
      if (b > 12 && a >= 1 && a <= 12) return { y, m: a, d: b <= 31 ? b : 0 };
      return { y, m: 0, d: 0 };
    }
    const t = Date.parse(s);
    if (isNaN(t)) return null;
    const dt = new Date(t);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }

  function parseName(raw) {
    const s = String(raw || "").replace(/\s+/g, " ").replace(/^by\s+/i, "").trim();
    if (!s) return null;
    if (ORG.test(s) && !s.includes(",")) return { family: s, given: "", org: true };
    if (s.includes(",")) {
      const [fam, ...rest] = s.split(",");
      return { family: fam.trim(), given: rest.join(" ").trim() };
    }
    const parts = s.split(" ");
    if (parts.length === 1) return { family: s, given: "", org: true };
    return { family: parts.pop(), given: parts.join(" ") };
  }

  // Meta tags give one name per tag; a PDF /Author is one string for everybody.
  function parseAuthors(list) {
    const names = [];
    for (const item of list || []) {
      const s = String(item || "").trim();
      let parts = [s];
      if (/[;]/.test(s)) parts = s.split(/\s*;\s*/);
      else if (/\s+and\s+|\s*&\s*/i.test(s)) parts = s.split(/\s+and\s+|\s*&\s*/i);
      else if (s.split(/\s*,\s*/).length > 1 && s.split(/\s*,\s*/).every((p) => p.trim().split(/\s+/).length >= 2)) parts = s.split(/\s*,\s*/);
      for (const p of parts) {
        const n = parseName(p);
        // "Contributors to Wikimedia projects", "Staff", "Editors": not a citable author.
        if (n && !/^(?:contributors?\b|(?:wikipedia |the )?(?:editors?|staff|contributors?)$)/i.test(n.family)) names.push(n);
      }
    }
    const seen = new Set();
    return names.filter((n) => { const k = `${n.family}|${n.given}`.toLowerCase(); return seen.has(k) ? false : (seen.add(k), true); }).slice(0, 50);
  }

  const initials = (given, dot, sp) => (/^[A-Z]{2,4}$/.test(given.trim()) ? given.trim().split("") : given.split(/[\s.]+/).filter(Boolean)).map((w) => {
    if (w.includes("-")) return w.split("-").filter(Boolean).map((x) => x[0].toUpperCase() + (dot ? "." : "")).join("-");
    return w[0].toUpperCase() + (dot ? "." : "");
  }).join(sp);
  const inverted = (a) => (a.org || !a.given ? a.family : `${a.family}, ${a.given}`);
  const natural = (a) => (a.given ? `${a.given} ${a.family}` : a.family);
  const dot = (s) => (/[.?!…]$/.test(s) ? s : s + ".");
  const shortTitle = (t) => { const w = t.split(/\s+/); return w.slice(0, 4).join(" ") + (w.length > 4 ? "…" : ""); };
  const listAnd = (l, sep, and) => (l.length < 2 ? l[0] || "" : l.length === 2 ? `${l[0]} ${and} ${l[1]}` : `${l.slice(0, -1).join(sep)}${sep}${and} ${l[l.length - 1]}`);

  // U.S. Supreme Court opinions only (reporter alone names the court): "X v. Y" in the title plus a
  // "347 U.S. 483" cite in the title or the first page's text. Anything else stays a generic citation.
  const T6 = [[/\bBoard\b/g, "Bd."], [/\bEducation\b/g, "Educ."], [/\bCompany\b/g, "Co."], [/\bCorporation\b/g, "Corp."], [/\bIncorporated\b/g, "Inc."],
    [/\bDepartment\b/g, "Dep't"], [/\bUniversity\b/g, "Univ."], [/\bNational\b/g, "Nat'l"], [/\bAssociation\b/g, "Ass'n"], [/\bCommission\b/g, "Comm'n"],
    [/\bRailroad\b/g, "R.R."], [/\bGovernment\b/g, "Gov't"], [/\bInternational\b/g, "Int'l"], [/\bUnited States\b(?=.*\bv\b)/g, "United States"]];
  function detectCase(title, head) {
    // The cite must be the page's own: in the title or near the top, not a citation to some other case deeper in the text.
    const citeRe = /\b(\d{1,3})\s+(U\.\s?S\.|S\.\s?Ct\.|L\.\s?Ed\.\s?2d)\s+(\d{1,4})\b(?:[^()]{0,40}\((\d{4})\))?/;
    const cite = citeRe.exec(title) || citeRe.exec(String(head).slice(0, 400));
    const sides = /^(.{2,80}?)\s+v\.?\s+(.{2,100}?)(?:,|\s*\(|\s+[|–—-]\s|\s+\d{1,3}\s+U\.\s?S\.|$)/.exec(title);
    if (!cite || !sides) return null;
    // A fully upper-case caption ("BROWN v. BOARD OF EDUCATION") has no acronyms to protect.
    const shouting = (sides[1] + sides[2]) === (sides[1] + sides[2]).toUpperCase();
    const fix = (s) => {
      let t = s.trim().replace(/^the\s+/i, "");
      // Cornell/Oyez-style captions: "Jane ROE, et al., Appellants," -> "Roe" (no given names, "et al.", party roles, trailing period).
      t = t.replace(/,?\s*(?:et\s+al\.?|and\s+others)\b.*$/i, "").replace(/,?\s*(?:Appellants?|Appellees?|Petitioners?|Respondents?|Plaintiffs?(?:\s+in\s+Error)?|Defendants?(?:\s+in\s+Error)?)\b.*$/i, "");
      const sur = /^(?:[A-Z][a-z]+\.?\s+)+([A-Z]{2,}(?:[-'][A-Z]{2,})*)$/.exec(t.replace(/[.,;\s]+$/, ""));
      if (sur) t = sur[1];
      t = t.replace(/[,;\s]+$/, "");
      // A short all-caps single token is an acronym (NLRB, EEOC, IBM) unless it was a Cornell-style surname.
      if (t === t.toUpperCase() && (sur || shouting || !/^[A-Z]{2,6}$/.test(t))) t = t.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/\b(Of|The|And|For|In)\b/g, (w) => w.toLowerCase());
      for (const [re, rep] of T6) t = t.replace(re, rep);
      // A final period ends the caption, not an abbreviation ("Wade." but "Ford Motor Co.").
      if (/\.$/.test(t) && !/(?:\b(?:Inc|Co|Corp|Ltd|Bros|Jr|Sr|St|Mt|Dr|Univ|Educ|Dep't|Ass'n|Nat'l|Comm'n|Gov't|Int'l)|\b[A-Z]|R\.R|U\.S)\.$/.test(t)) t = t.slice(0, -1);
      return t;
    };
    const dec = /\bDecided:?\s+[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+(\d{4})/.exec(head);
    return { name: `${fix(sides[1])} v. ${fix(sides[2])}`, cite: `${cite[1]} ${/^U/.test(cite[2]) ? "U.S." : /^S/.test(cite[2]) ? "S. Ct." : "L. Ed. 2d"} ${cite[3]}`, year: cite[4] || (dec ? dec[1] : "") };
  }

  // UK courts (OSCOLA): a neutral citation ("[2017] UKSC 5") in the page text plus "X v Y" in the title.
  // The law-report cite (e.g. "[2005] QB 410") is rarely on the page, and OSCOLA allows the neutral cite alone.
  const UK_NEUTRAL = /\[(\d{4})\]\s+(UKSC|UKHL|UKPC|EWCA\s+(?:Civ|Crim)|EWHC\s+\d+\s+\((?:Admin|Ch|QB|KB|Fam|TCC|Comm|Pat|IPEC|Costs)\)|EWFC\s+\d+|NIQB|NICA|NIKB|NICh|NIFam|CSIH|CSOH|UKUT\s+\d+\s+\((?:IAC|TCC|AAC|LC)\)|UKFTT\s+\d+\s+\((?:TC|GRC)\))(?:\s+(\d+))?/;
  function detectUkCase(title, head) {
    const labelled = /Neutral Citation(?: Number)?\s*:?\s*(\[\d{4}\][^\n]{0,40})/i.exec(head);
    const cite = UK_NEUTRAL.exec(title) || (labelled && UK_NEUTRAL.exec(labelled[1])) || UK_NEUTRAL.exec(head);
    if (!cite) return null;
    // Number position differs: "[2017] UKSC 5" vs "[2016] EWHC 2768 (Admin)".
    const court = cite[2].replace(/\s+/g, " ");
    const num = cite[3] || "";
    if (!/\d/.test(court) && !num) return null;
    let name = title.replace(/\s*[|–—-]\s*(?:Find Case Law|UK Supreme Court|BAILII|The National Archives)\b.*$/i, "")
      .replace(/\s*\[\d{4}\].*$/, "").replace(/\s*\((?:Appellants?|Respondents?|Claimants?|Defendants?|Applicants?)\)/gi, "").trim();
    const sides = /^(.{2,120}?)\s+v\.?\s+(.{2,160})$/.exec(name) || /^(.{2,120}?)\s+v(?=[A-Z])(.{2,160})$/.exec(name);
    if (!sides) return null;
    const trim = (s) => s.replace(/\s*(?:,\s*)?(?:and|&)\s+(?:another|others|anor|ors)\b\.?/gi, "").replace(/\s+/g, " ").trim();
    let a = trim(sides[1]);
    const b = trim(sides[2]);
    // "R (on the application of Miller) v ..." is cited "R (Miller) v ...".
    const app = /^R\s*\(\s*on the application of\s+(.+?)\s*\)$/i.exec(a);
    if (app) a = `R (${trim(app[1])})`;
    else {
      // The National Archives drops the "R (…)" prefix from some titles; take it back from the page text.
      const r = new RegExp(`\\bR\\s*\\(\\s*(?:on the application of\\s+)?(${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s*\\)\\s+v\\b`, "i").exec(head);
      if (r) a = `R (${a})`;
    }
    if (a.length < 2 || b.length < 2) return null;
    return { name: `${a} v ${b}`, cite: `[${cite[1]}] ${court}${num ? " " + num : ""}`.replace(/\s+/g, " "), year: cite[1] };
  }

  // Australia (AGLC4): medium-neutral citation "[2020] HCA 33" plus "X v Y" in the title. Rules from a
  // library copy of AGLC4 (round brackets only for volume-arranged reports, which are not built here).
  const AU_NEUTRAL = /\[((?:19|20)\d{2})\]\s+(HCA|FCAFC|FCA|FCCA|FedCFamC1A|FedCFamC2F|FedCFamC1F|FamCAFC|FamCA|NSWCCA|NSWCA|NSWSC|NSWDC|VSCA|VSC|VCC|QCA|QSC|QDC|WASCA|WASC|SASCFC|SASC|TASSC|TASFC|ACTCA|ACTSC|NTCA|NTSC|AATA|ARTA)\s+(\d{1,5})\b/;
  function detectAuCase(title, head) {
    const labelled = /(?:Medium neutral citation|Neutral citation|Citation)\s*:\s*([^\n]{0,60})/i.exec(head);
    const cite = AU_NEUTRAL.exec(title) || (labelled && AU_NEUTRAL.exec(labelled[1])) || AU_NEUTRAL.exec(head);
    if (!cite) return null;
    const name = title.replace(/\s*[|–—-]\s*(?:AustLII|High Court of Australia|Federal Court of Australia|Judgments?|Decisions?)\b.*$/i, "")
      .replace(/\s*\[(?:19|20)\d{2}\].*$/, "").replace(/\s*\((?:Appellants?|Respondents?|Applicants?|Plaintiffs?|Defendants?)\)/gi, "")
      .replace(/\b(v)\.(?=\s)/g, "$1").replace(/\b(Pty|Ltd|Inc|Co|Corp)\.(?=\s|$|\))/g, "$1").replace(/\s+/g, " ").trim();
    if (!/^.{2,160}?\s+v\s+.{2,200}$/.test(name)) return null;
    return { name, cite: `[${cite[1]}] ${cite[2]} ${cite[3]}` };
  }

  // Canada (McGill Guide): neutral citation "2012 ONCA 321" (year, court, number) plus "X v Y" in the title.
  // Verified from McGill 10th ed. library guides and one Ontario Court of Appeal judgment; SCC pages were unreachable.
  const CA_NEUTRAL = /\b((?:19|20)\d{2})\s+(SCC|CSC|FCA|CAF|FC|CF|TCC|CCI|CMAC|ONCA|ONSC|ONCJ|BCCA|BCSC|BCPC|ABCA|ABKB|ABQB|ABPC|SKCA|SKKB|SKQB|MBCA|MBKB|MBQB|QCCA|QCCS|QCCQ|NSCA|NSSC|NBCA|NBKB|NBQB|PECA|PESC|NLCA|NLSC|NLSCTD|YKCA|YKSC|NWTCA|NWTSC|NUCA|NUCJ)\s+(\d{1,5})\b/;
  function detectCaCase(title, head) {
    const labelled = /(?:Citation|Neutral citation)\s*:\s*([^\n]{0,80})/i.exec(head);
    const cite = CA_NEUTRAL.exec(title) || (labelled && CA_NEUTRAL.exec(labelled[1])) || CA_NEUTRAL.exec(head);
    if (!cite) return null;
    let name = title.replace(/\s+\(CanLII\)/gi, "").replace(/\s*,?\s*(?:19|20)\d{2}\s+[A-Z]{2,8}\s+\d{1,5}\b.*$/, "")
      .replace(/\s*[|–—-]\s*(?:CanLII|Supreme Court|Cour suprême|SCC|Court of Appeal|Judgments?|Decisions?)\b.*$/i, "").trim();
    // "Her Majesty the Queen" and "The King" are written "R"; periods in "v.", "c.", "R." and initials are dropped.
    name = name.replace(/^(?:Her Majesty the Queen|His Majesty the King|The Queen|The King|Regina|Rex)\b/i, "R")
      .replace(/\b(v|c|R)\.(?=\s|$)/g, "$1")
      .replace(/\b(?:[A-Z]\.){2,}/g, (x) => x.replace(/\./g, ""))
      .replace(/\b(Ltd|Inc|Corp|Co|Ltée)\.(?=\s|$|,)/g, "$1")
      .replace(/\s+/g, " ").trim();
    const sides = /^(.{1,160}?)\s+(v|c)\s+(.{1,200})$/.exec(name);
    if (!sides) return null;
    return { name, cite: `${cite[1]} ${cite[2]} ${cite[3]}` };
  }

  // India: reporter cites printed in the judgment header ("(1973) 4 SCC 225", "2017 (10) SCC 1", "AIR 1973 SC 1461")
  // or the Supreme Court neutral cite ("2024 INSC 746", introduced by the Court's notice of 6 July 2023, which leads when
  // present). No authoritative Indian citation guide was verified for the rest: it is the common practice
  // "Party v Party, 2024 INSC 746, (year) vol SCC page". Indian Kanoon titles read "X vs Y on 24 April, 1973".
  const IN_SCC = /(?:\((\d{4})\)\s*(\d{1,3})|\b(\d{4})\s*\(?(\d{1,3})\)?)\s+SCC\s+(\d{1,4})\b(?!\s*Online)/;
  const IN_AIR = /\bAIR\s+(\d{4})\s+(?:SUPREME COURT|SC)(?:\s*\((?:CIV|CRI|CRL)\))?\s+(\d{1,4})\b/i;
  const IN_NEUTRAL = /\b(\d{4})\s*(?::\s*)?INSC(?:\s*:\s*|\s+)(\d{1,5})\b/;
  // Indian Kanoon's own header form: "1978 AIR 597" and "1978 SCC (1) 248".
  const IN_SCC_KANOON = /\b(\d{4})\s+SCC\s*\((\d{1,3})\)\s*(\d{1,4})\b/;
  const IN_AIR_KANOON = /\b(\d{4})\s+AIR\s+(\d{1,4})\b/;
  function detectInCase(title, head) {
    const text = `${title} ${head}`;
    const k = IN_SCC_KANOON.exec(text);
    const scc = IN_SCC.exec(text) || (k && [k[0], k[1], k[2], undefined, undefined, k[3]]);
    const ka = IN_AIR_KANOON.exec(text);
    const air = IN_AIR.exec(text) || (ka && [ka[0], ka[1], ka[2]]);
    const neu = IN_NEUTRAL.exec(text);
    const parts = [];
    if (scc) parts.push(`(${scc[1] || scc[3]}) ${scc[2] || scc[4]} SCC ${scc[5]}`);
    else if (air && !neu) parts.push(`AIR ${air[1]} SC ${air[2]}`);
    // The Supreme Court's neutral citation (notice of 6 July 2023) leads; SCC / AIR follow as parallel cites.
    if (neu) parts.unshift(`${neu[1]} INSC ${neu[2]}`);
    if (!parts.length) return null;
    let name = title.replace(/\s*[|–—-]\s*(?:Indian Kanoon|Supreme Court of India|SCC Online|Judgments?)\b.*$/i, "")
      .replace(/^Indian Kanoon\s*[-–—]\s*/i, "")
      .replace(/\s+on\s+\d{1,2}\s+[A-Za-z]+,?\s+\d{4}\s*$/, "")
      .replace(/\s*(?:,\s*)?\b(?:19|20)\d{2}\s*(?::\s*)?INSC.*$/, "").replace(/\s*\(\d{4}\)\s*\d+\s+SCC.*$/, "")
      .replace(/\s*(?:\.{2,}|…)\s*/g, " ").replace(/\s*(?:,\s*)?(?:and|&)\s+(?:anr|ors|others|another)\b\.?/gi, "")
      .replace(/\s+(?:vs?|versus)\.?\s+/i, " v ").replace(/\s+/g, " ").trim();
    const sides = /^(.{2,160}?) v (.{2,200})$/.exec(name);
    if (!sides) return null;
    // Indian Kanoon prints "State Of Kerala": small words go back to lower case; "K.S.Puttaswamy(Retd)" gets its spaces.
    const fix = (s) => s.replace(/\.(?=[A-Z][a-z])/g, ". ").replace(/([a-z])\(/g, "$1 (")
      .replace(/(\S)\s+(Of|The|And|For|In|On|At)\b/g, (a, b, w) => `${b} ${w.toLowerCase()}`);
    const year = (scc && (scc[1] || scc[3])) || (air && air[1]) || (neu && neu[1]) || "";
    return { name: `${fix(sides[1])} v ${fix(sides[2])}`, cite: parts.join(", "), year, hasReporter: !!(scc || air) };
  }

  // Germany: "BGH, Beschl. v. 01.12.2020 – XI ZR 526/19" (illustrative shape only, not a checked real decision; court, decision type, date, Aktenzeichen). Titles often
  // carry no parties, so detection keys on the court name + Aktenzeichen; BVerfGE adds "BVerfGE 65, 1". The standard
  // German form is UNVERIFIED against an official guide (common practice). No italics, no in-text marker.
  const DE_COURTS = [[/\b(?:BVerfG|Bundesverfassungsgericht)\b/, "BVerfG"], [/\b(?:BGH|Bundesgerichtshof)\b/, "BGH"],
    [/\b(?:BVerwG|Bundesverwaltungsgericht)\b/, "BVerwG"], [/\b(?:BAG|Bundesarbeitsgericht)\b/, "BAG"],
    [/\b(?:BFH|Bundesfinanzhof)\b/, "BFH"], [/\b(?:BSG|Bundessozialgericht)\b/, "BSG"], [/\b(?:BPatG|Bundespatentgericht)\b/, "BPatG"]];
  const DE_MONTHS = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
  const DE_AZ_VERF = /\b([12] Bv[A-Z]{1,2}) (\d{1,5}(?:, \d{1,5})*)\/(\d{2})\b/;
  const DE_AZ_BGH = /\b([IVX]{1,5}a?) ([A-Z][A-Za-z]{1,3}) (\d{1,4}(?:, \d{1,4})*)\/(\d{2})\b/;
  function detectDeCase(title, head) {
    const text = `${title} ${head}`;
    let court = "";
    for (const [re, abbr] of DE_COURTS) if (re.test(text)) { court = abbr; break; }
    const verf = DE_AZ_VERF.exec(text);
    const bgh = DE_AZ_BGH.exec(text);
    const rep = /\bBVerfGE\s+(\d{1,3}),\s*(\d{1,4})\b/.exec(text);
    if (!court && rep) court = "BVerfG";
    if (!court || !(verf || bgh || rep)) return null;
    const az = verf ? `${verf[1]} ${verf[2]}/${verf[3]}` : bgh ? `${bgh[1]} ${bgh[2]} ${bgh[3]}/${bgh[4]}` : "";
    let date = "";
    const dm = /\b(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/.exec(text);
    if (dm) date = `${dm[1].padStart(2, "0")}.${String(DE_MONTHS.indexOf(dm[2].toLowerCase()) + 1).padStart(2, "0")}.${dm[3]}`;
    else { const n = /\b(\d{2})\.(\d{2})\.((?:19|20)\d{2})\b/.exec(text); if (n) date = `${n[1]}.${n[2]}.${n[3]}`; }
    // The first decision-type word wins: a Beschluss often mentions the lower court's Urteil further down.
    const ty = /\b(Urteil|Urt\.|Beschluss|Beschl\.|Gerichtsbescheid|Vorlagebeschluss)/.exec(text);
    const kind = !ty ? "Entsch." : /^U/.test(ty[1]) ? "Urt." : /^G/.test(ty[1]) ? "Gerichtsbescheid" : "Beschl.";
    const repTxt = rep ? `BVerfGE ${rep[1]}, ${rep[2]}` : "";
    let cite = `${court}, ${kind}${date ? ` v. ${date}` : ""}${az ? ` – ${az}` : ""}`;
    if (!az && !date) cite = court;
    if (repTxt) cite = az || date ? `${cite}, ${repTxt}` : repTxt;
    return { cite, year: date ? date.slice(-4) : "" };
  }

  // Austria: "VfGH 14.3.2018, G 227/2017" (court, date without leading zeros, Geschäftszahl). Court names/abbreviations
  // are required for VfGH/VwGH/OGH/BVwG/BFG; the Geschäftszahl shape alone is enough for OGH and VwGH. UNVERIFIED
  // against an official guide (common practice). BVwG is matched by abbreviation only: the full name is also German.
  const AT_COURTS = [[/\b(?:VfGH|Vfgh|Verfassungsgerichtshof)\b/, "VfGH"], [/\b(?:VwGH|Vwgh|Verwaltungsgerichtshof)\b/, "VwGH"],
    [/\b(?:OGH|Oberster Gerichtshof|Oberste Gerichtshof)\b/, "OGH"], [/\bBVwG\b/, "BVwG"], [/\b(?:BFG|Bundesfinanzgericht)\b/, "BFG"]];
  // The space after the letter is optional and the year may have two digits (jusline.at prints "B476/90").
  const AT_GZ_VFGH = /\b((?:KR|SV|WI|[GVBEAWF]) ?\d{1,4}\/(?:\d{4}|\d{2}))(?:-\d+)?\b/;
  const AT_GZ_OGH = /\b(\d{1,2} (?:ObA|ObS|ObSch|Ob|Os|Nc|Ok|Nd|Ra) \d{1,4}\/\d{2}[a-z])\b/;
  const AT_GZ_VWGH = /\b((?:Ra|Ro|Fr|Ko|Zl) \d{4}\/\d{2}\/\d{4}|\d{4}\/\d{2}\/\d{4})\b/;
  const AT_GZ_BFG = /\b(RV|RS|RM|RD|RE|RN) \/\d{4}\/\d{4}\b/;
  function detectAtCase(title, head) {
    const text = `${title} ${head}`;
    let court = "";
    for (const [re, abbr] of AT_COURTS) if (re.test(text)) { court = abbr; break; }
    const ogh = AT_GZ_OGH.exec(text), vwgh = AT_GZ_VWGH.exec(text), vfgh = AT_GZ_VFGH.exec(text);
    if (!court && ogh) court = "OGH";
    if (!court && vwgh && /[A-Za-z]/.test(vwgh[1])) court = "VwGH";
    if (!court) return null;
    const gz = court === "OGH" ? ogh && ogh[1] : court === "VwGH" ? vwgh && vwgh[1] : court === "VfGH" ? vfgh && vfgh[1].replace(/^([A-Z]+)(?=\d)/, "$1 ") : null;
    if (!gz) return null;
    let date = "";
    const dm = /\b(\d{1,2})\.\s*(Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/.exec(text);
    const iso = /\b((?:19|20)\d{2})\/(\d{1,2})\/(\d{1,2})\b/.exec(title); // jusline title: "1991/6/26" is the decision date, body dates are not
    if (iso) date = `${+iso[3]}.${+iso[2]}.${iso[1]}`;
    else if (dm) { const mi = DE_MONTHS.indexOf(dm[2].toLowerCase().replace("jänner", "januar")) + 1; date = `${+dm[1]}.${mi}.${dm[3]}`; }
    else { const n = /\b(\d{1,2})\.(\d{1,2})\.((?:19|20)\d{2})\b/.exec(text); if (n) date = `${+n[1]}.${+n[2]}.${n[3]}`; }
    return { cite: date ? `${court} ${date}, ${gz}` : `${court}, ${gz}`, year: date ? date.slice(-4) : "" };
  }

  // Switzerland: published "BGE 144 V 50" (French "ATF", Italian "DTF"); unpublished "Urteil 1C_289/2016 vom 1. Juli 2016"
  // (French "arrêt 9C_654/2007 du 28 janvier 2008"). The Federal Court's German citation rules (Zitierregeln 2013) give
  // "Urteil (des Bundesgerichts) 9C_654/2007 vom 28. Januar 2008"; the French form is UNVERIFIED. Language follows the
  // page: ATF/arrêt/French month = fr. Markers such as "zur Publikation vorgesehen" are not produced.
  const FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const frDate = (text) => {
    const dm = /\b(\d{1,2}|1er)\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/i.exec(text);
    if (dm) { const k = dm[2].toLowerCase().replace("fevrier", "février").replace("aout", "août").replace("decembre", "décembre"); return { d: parseInt(dm[1], 10), m: FR_MONTHS.indexOf(k) + 1, y: +dm[3] }; }
    const n = /\b(\d{1,2})[./](\d{1,2})[./]((?:19|20)\d{2})\b/.exec(text);
    return n ? { d: +n[1], m: +n[2], y: +n[3] } : null;
  };
  function detectChCase(title, head) {
    const text = `${title} ${head}`;
    const bge = /\b(BGE|ATF|DTF)\s+(\d{1,3})\s+(I{1,3}[ab]?|IV|V|Ia|Ib)\s+(\d{1,4})\b/.exec(text);
    const dock = /\b(\d[A-Z][_.]\d{1,4}\/\d{4})\b/.exec(text);
    if (!bge && !dock) return null;
    const fr = /\b(?:ATF|arrêt|Tribunal fédéral)\b/.test(text) || (bge && bge[1] === "ATF");
    const de = /\b(?:BGE|Urteil|Bundesgericht)\b/.test(text);
    const lang = fr && !de ? "fr" : "de";
    // An unpublished decision page (docket in the title or opening text) often cites BGE precedents in its body:
    // the page's own docket wins unless the BGE itself is in the title or opening text too.
    const opening = `${title} ${head.slice(0, 300)}`;
    const ownDock = dock && opening.includes(dock[1]);
    const ownBge = bge && opening.includes(bge[0]);
    if (bge && (ownBge || !ownDock)) return { cite: `${bge[1]} ${bge[2]} ${bge[3]} ${bge[4]}`, year: "" };
    if (!dock) return null;
    let date = null;
    const dm = /\b(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/.exec(text);
    if (dm) date = { d: +dm[1], m: DE_MONTHS.indexOf(dm[2].toLowerCase()) + 1, y: +dm[3] };
    else date = frDate(text);
    const when = !date ? "" : lang === "fr" ? ` du ${date.d === 1 ? "1er" : date.d} ${FR_MONTHS[date.m - 1]} ${date.y}`
      : ` vom ${date.d}. ${["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][date.m - 1]} ${date.y}`;
    return { cite: `${lang === "fr" ? "arrêt" : "Urteil (des Bundesgerichts)"} ${dock[1]}${when}`, year: date ? String(date.y) : "" };
  }

  // France: "CE, 5e ch., 5 juillet 2022, n° 452804", "Cons. const., déc. n° 2018-768 QPC, 21 mars 2019",
  // "Cass. civ. 1re, 31 janvier 2019, n° 17-28.605". Common practice, UNVERIFIED against an official guide.
  function detectFrCase(title, head) {
    const text = `${title} ${head}`;
    const date = frDate(text);
    const when = date ? `${date.d === 1 ? "1er" : date.d} ${FR_MONTHS[date.m - 1]} ${date.y}` : "";
    const yr = date ? String(date.y) : "";
    const cc = /D[ée]cision\s+n[°o]\s*(\d{4}-\d+)\s+(QPC|DC|LP|L|AUDCV|[A-Z]{1,5})\b/.exec(text);
    if (cc) return { cite: `Cons. const., déc. n° ${cc[1]} ${cc[2]}${when ? `, ${when}` : ""}`, year: yr };
    if (/Conseil d['’]État/i.test(text)) {
      const num = /(?:N°|n°|,)\s*(\d{5,7})\b/.exec(text);
      if (!num) return null;
      const ch = /\b(\d{1,2})\s*(?:ème|ᵉ|e|ère|re)?\s+chambre/i.exec(text);
      const sec = /chambres réunies/i.test(text) ? "ch. réunies" : /Assemblée/i.test(text) ? "Ass." : /Section/.test(text) ? "Sect." : ch ? `${ch[1]}e ch.` : "";
      return { cite: ["CE", sec, when, `n° ${num[1]}`].filter(Boolean).join(", "), year: yr };
    }
    const pv = /(?:pourvoi\s+)?n[°o]\s*(\d{2}-\d{2}\.\d{3})\b/i.exec(text) || /\b(\d{2}-\d{2}\.\d{3})\b/.exec(text);
    if (pv && /Cour de cassation|Cass\./i.test(text)) {
      const ch = /(Première|1[èe]re?)\s+chambre\s+civile/i.test(text) ? "civ. 1re" : /(Deuxième|2[èe]me?|2e)\s+chambre\s+civile/i.test(text) ? "civ. 2e"
        : /(Troisième|3[èe]me?|3e)\s+chambre\s+civile/i.test(text) ? "civ. 3e" : /chambre commerciale/i.test(text) ? "com."
        : /chambre sociale/i.test(text) ? "soc." : /chambre criminelle/i.test(text) ? "crim." : "";
      return { cite: [`Cass.${ch ? " " + ch : ""}`, when, `n° ${pv[1]}`].filter(Boolean).join(", "), year: yr };
    }
    return null;
  }

  // Italy: "Corte cost., sent. n. 24 del 2019", "Corte cost., ord. n. 119 del 2018", "Cass., sez. un., 6 ottobre 2023, n. 28167".
  // Common practice, UNVERIFIED against an official guide. Corte costituzionale pages carry "Sentenza n. N del YYYY".
  const IT_MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  function detectItCase(title, head) {
    const text = `${title} ${head}`;
    const cass = /\bSez\.\s*(U|\d+|[IVX]+|[A-Z]{1,3})\b[^]{0,80}?\b(Sentenza|Ordinanza)\s+n\.\s*(\d+)\s+del\s+(\d{2})\/(\d{2})\/((?:19|20)\d{2})\b/.exec(text);
    if (cass) {
      const sez = cass[1] === "U" ? "sez. un." : `sez. ${cass[1]}`;
      return { cite: `Cass., ${sez}, ${+cass[4]} ${IT_MONTHS[+cass[5] - 1]} ${cass[6]}, n. ${cass[3]}`, year: cass[6] };
    }
    const cc = /\b(Sentenza|Ordinanza)\s+n\.?\s*(\d{1,4})\s+del\s+((?:19|20)\d{2})\b/i.exec(text)
      || (/ECLI:IT:COST|Corte costituzionale/i.test(text) && /\b(Sentenza|Ordinanza)\s+(\d{1,4})\/((?:19|20)\d{2})\b/i.exec(text));
    if (!cc) return null;
    // Decision date ("Così deciso in Roma, ... il 5 giugno 1956", or "Data decisione: 05/06/1956"): "Corte cost., sent. 5 giugno 1956, n. 1".
    const kind = /^s/i.test(cc[1]) ? "sent." : "ord.";
    const dm = new RegExp(`Così deciso[^.]{0,160}?\\bil\\s+(\\d{1,2})(?:º|°)?\\s+(${IT_MONTHS.join("|")})\\s+(${cc[3]})\\b`, "i").exec(text)
      || new RegExp(`Data (?:della )?decisione:?\\s*(\\d{1,2})[/.](\\d{1,2})[/.](${cc[3]})\\b`, "i").exec(text);
    if (dm) {
      const mo = /^\d+$/.test(dm[2]) ? IT_MONTHS[+dm[2] - 1] : dm[2].toLowerCase();
      if (mo) return { cite: `Corte cost., ${kind} ${+dm[1]} ${mo} ${cc[3]}, n. ${cc[2]}`, year: cc[3] };
    }
    return { cite: `Corte cost., ${kind} n. ${cc[2]} del ${cc[3]}`, year: cc[3] };
  }

  // Spain: "STC 58/2018, de 4 de junio", "ATC 56/2023, de 20 de febrero", "STS 496/2022, de ..." (the number carries the year).
  // Needs the court (Tribunal Constitucional / Supremo, or the STC/ATC/STS/ATS abbreviation). UNVERIFIED against TC guidance.
  const ES_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function detectEsCase(title, head) {
    const text = `${title} ${head}`;
    let court = /\b(?:STC|ATC)\b|Tribunal Constitucional|ECLI:ES:TC/.test(text) ? "TC" : /\b(?:STS|ATS)\b|Tribunal Supremo|ECLI:ES:TS/.test(text) ? "TS" : "";
    const num = /\b(?:STC|ATC|STS|ATS|Sentencia|SENTENCIA|Auto|AUTO)\s+(?:n[úu]m\.\s*)?(\d{1,4}\/(?:19|20)\d{2})\b/.exec(text);
    if (!court || !num) return null;
    const auto = /\b(?:ATC|ATS|Auto|AUTO)\b/.test(text.slice(Math.max(0, num.index - 2), num.index + 12)) || /ECLI:ES:T[CS]:\d{4}:\d+A\b/.test(text);
    const dm = new RegExp(`\\b${num[1].replace("/", "\\/")},\\s*de\\s+(\\d{1,2})\\s+de\\s+(${ES_MONTHS.join("|")})`, "i").exec(text);
    const when = dm ? `, de ${+dm[1]} de ${dm[2].toLowerCase()}` : "";
    return { cite: `${auto ? "A" : "S"}${court} ${num[1]}${when}`, year: num[1].slice(-4) };
  }

  // EU courts: "Judgment of 13 May 2014, Google Spain and Google, C-131/12, EU:C:2014:317" (name omitted when unknown;
  // "Case C-131/12, EU:C:2014:317" when the date is unknown). UNVERIFIED against the Court's own citation guidance.
  function detectEuCase(title, head) {
    const text = `${title} ${head}`;
    // A hyphen is required ("C-131/12"): a bare "C 5/10" is not a case number.
    const num = /(?<![A-Za-z])([CTF])[-‑–](\d{1,4})\/(\d{2})\b/.exec(text);
    const ecli = /\bECLI:(EU:[CTF]:\d{4}:\d+)\b/.exec(text);
    if (!num || !(ecli || /Court of Justice|CJEU|CURIA|General Court|(?<![A-Za-z])Gerichtshof|Cour de justice|Tribunal de Justicia/i.test(text))) return null;
    let date = null;
    // Prefer the date right after "Judgment of" / "Order of" / "delivered", else the first date on the page.
    const dateRe = [/\b(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2})\b/, new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join("|")})\\s+((?:19|20)\\d{2})\\b`)];
    const pick = (s) => {
      const n = dateRe[0].exec(s), mi = dateRe[1].exec(s);
      if (n && (!mi || n.index < mi.index)) return { d: +n[1], m: +n[2], y: n[3] };
      return mi ? { d: +mi[1], m: MONTHS.indexOf(mi[2]) + 1, y: mi[3] } : null;
    };
    const anchor = /(?:Judgment|Order|Opinion|Arr[êe]t|Urteil|delivered|Sentencia)[^\n]{0,60}/i.exec(text);
    date = (anchor && pick(anchor[0])) || pick(text);
    const no = `${num[1]}-${num[2]}/${num[3]}`;
    const tail = ecli ? `, ${ecli[1]}` : "";
    const top = text.slice(0, 500);
    const kind = /Opinion of Advocate General/i.test(top) ? "Opinion of Advocate General" : /\bOrder of the (?:Court|Vice-President|President)|\bOrder of\b/i.test(top) ? "Order" : "Judgment";
    return { cite: date ? `${kind} of ${date.d} ${MONTHS[date.m - 1]} ${date.y}, ${no}${tail}` : `Case ${no}${tail}`, year: date ? String(date.y) : "" };
  }

  // Brazil: "STF, ADI 0.000 MC, Rel. Min. [Name], DJe 12.06.2018" (illustrative placeholders, not a real case; court, class + number, rapporteur, DJe or judgment date).
  // Court from its name or from the class (REsp = STJ; ADI/ADPF/ADC/RE = STF). Common practice, UNVERIFIED (ABNT NBR 6023 not read).
  const PT_MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const ptDate = (text) => {
    const dm = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${PT_MONTHS.join("|")}|marco)\\s+de\\s+((?:19|20)\\d{2})\\b`, "i").exec(text);
    if (dm) return { d: +dm[1], m: PT_MONTHS.indexOf(dm[2].toLowerCase().replace("marco", "março")) + 1, y: +dm[3] };
    const n = /\b(\d{1,2})[./](\d{1,2})[./]((?:19|20)\d{2})\b/.exec(text);
    return n ? { d: +n[1], m: +n[2], y: +n[3] } : null;
  };
  function detectBrCase(title, head) {
    const text = `${title} ${head}`;
    const num = "(\\d{1,3}(?:\\.\\d{3})+|\\d{1,7})";
    const stf = new RegExp(`\\b(ADI|ADPF|ADC|ADO|ARE|RE|RCL|Rcl|HC|MS|AI)\\s*(?:n[º°.]?\\s*)?${num}(?:[-\\s]?(MC|AgR|ED|QO|RG))?(?!\\d)`).exec(text);
    const stj = new RegExp(`\\b(REsp|AREsp|AgInt|EDcl|AgRg|RMS|RHC|HC)\\s*(?:n[º°.]?\\s*)?${num}(?:\\/([A-Z]{2}))?(?!\\d)`).exec(text);
    let court = /Supremo Tribunal Federal|\bSTF\b/.test(text) ? "STF" : /Superior Tribunal de Justiça|\bSTJ\b/.test(text) ? "STJ" : /Tribunal Superior do Trabalho|\bTST\b/.test(text) ? "TST" : "";
    let hit = null;
    // A court named on the page wins; a case class only decides when no court is named (an STF page may mention a REsp and vice versa).
    const named = court;
    if (stj && (named === "STJ" || (!named && /^(REsp|AREsp)$/.test(stj[1])))) { court = "STJ"; hit = stj; }
    else if (stf && (named === "STF" || (!named && /^(ADI|ADPF|ADC|ADO|RCL|Rcl)$/.test(stf[1])))) { court = "STF"; hit = stf; }
    else if (court && (stf || stj)) hit = stf || stj;
    if (!court || !hit) return null;
    const cls = hit[1] === "RCL" ? "Rcl" : hit[1];
    const id = `${cls} ${hit[2]}${hit[3] && hit[3].length <= 4 && /^[A-Z]/.test(hit[3]) && court === "STF" ? " " + hit[3] : ""}${court === "STJ" && hit[3] ? "/" + hit[3] : ""}`;
    // "Rel. Min. X", "Relator: Min. X", "Relator(a): Min. X"; the name is at most 3 words and stops before page labels like "Tribunal Pleno".
    const rel = /(?<![\p{L}])Rel(?:ator(?:\(a\)|a)?|\.)?:?\s*(?:Min(?:istr[oa])?\.?\s*)([\p{Lu}][\p{L}]+(?:\s+(?:(?:de|da|do|dos|das)\s+)?(?!Tribunal|Plen|Julg|[ÓO]rg|Publica|Data|Parte|Ement|Decis|Ac[óo]rd|Relat|Recorr|Agrav)[\p{Lu}][\p{L}]+){0,2})/u.exec(text);
    const pub = /Publica[çc][ãa]o:\s*[^,\n]{0,20},?\s*(\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4})/iu.exec(text);
    const date = ptDate(pub ? pub[1] : text);
    const p2 = (n) => String(n).padStart(2, "0");
    const when = !date ? "" : pub ? `DJe ${p2(date.d)}.${p2(date.m)}.${date.y}` : `j. ${p2(date.d)}.${p2(date.m)}.${date.y}`;
    return { cite: [court, id, rel ? `Rel. Min. ${rel[1].trim()}` : "", when].filter(Boolean).join(", "), year: date ? String(date.y) : "" };
  }

  // Portugal: "Ac. do STJ de 15 de março de 2018, proc. n.º 123/16.0T8LSB.L1.S1"; Tribunal Constitucional "Ac. do TC n.º 123/2018".
  // Common practice, UNVERIFIED. Process numbers (dgsi.pt style) are required for the ordinary courts.
  function detectPtCase(title, head) {
    const text = `${title} ${head}`;
    const proc = /\b(\d{1,5}\/\d{2}\.\d[A-Z0-9]{3,7}(?:\.[A-Z]\d{1,2}){0,3})\b/.exec(text);
    const tcN = /Ac[óo]rd[ãa]o\s+n\.?[º°o]?\s*(\d{1,4}\/(?:19|20)\d{2})/i.exec(text);
    const rels = { Lisboa: "TRL", Porto: "TRP", Coimbra: "TRC", Évora: "TRE", Guimarães: "TRG" };
    const rel = /Tribunal da Rela[çc][ãa]o de (Lisboa|Porto|Coimbra|Évora|Guimarães)/.exec(text);
    const court = /Tribunal Constitucional/i.test(text) && tcN ? "TC" : rel ? rels[rel[1]] : /Supremo Tribunal Administrativo|\bSTA\b/.test(text) ? "STA"
      : /Supremo Tribunal de Justiça|\bSTJ\b/.test(text) ? "STJ" : "";
    if (!court || (court === "TC" ? !tcN : !proc)) return null;
    let date = ptDate(text);
    if (court === "TC") {
      // The page quotes lower-court dates; the acórdão's own date falls in the year of its number.
      const re = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${PT_MONTHS.join("|")})\\s+de\\s+${tcN[1].slice(-4)}\\b`, "gi");
      let last = null, mm;
      while ((mm = re.exec(text))) last = mm;
      date = last ? { d: +last[1], m: PT_MONTHS.indexOf(last[2].toLowerCase()) + 1, y: +tcN[1].slice(-4) } : null;
    }
    const when = date ? ` de ${date.d} de ${PT_MONTHS[date.m - 1]} de ${date.y}` : "";
    const cite = court === "TC" ? `Ac. do TC n.º ${tcN[1]}${when}` : `Ac. do ${court}${when}, proc. n.º ${proc[1]}`;
    return { cite, year: date ? String(date.y) : (tcN ? tcN[1].slice(-4) : "") };
  }

  // Japan: "最高裁判所第一小法廷判決昭和31年10月4日集民23号349頁" (court, decision type, era date, reporter; the 事件番号 stands in
  // when no reporter is shown). Era dates stay as the page writes them. Common practice, UNVERIFIED against 法律文献の引用方法.
  function detectJpCase(title, head) {
    const text = `${title} ${head}`.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const court = /(最高裁判所(?:第[一二三]小法廷|大法廷)?|[^\s　、。]{2,5}高等裁判所|[^\s　、。]{2,5}地方裁判所)/.exec(text);
    const no = /(明治|大正|昭和|平成|令和)(元|\d{1,2})年?\s*[(（](オ|受|ク|ネ|行ツ|行ヒ|あ|い|う|え|お|う|行ケ|行コ|ワ|ネ|ヨ|[ぁ-ん]{1,2})[)）]\s*第?(\d+)号?/.exec(text);
    const rep = /(集民|民集|刑集|集刑|判時|判タ)\s*(?:第?(\d+)巻)?\s*第?(\d+)号\s*(\d+)頁/.exec(text);
    if (!court || !(no || rep)) return null;
    const dateAfter = /裁判年月日\s*[:：]?\s*((?:明治|大正|昭和|平成|令和)(?:元|\d{1,2})年\d{1,2}月\d{1,2}日)/.exec(text)
      || /((?:明治|大正|昭和|平成|令和)(?:元|\d{1,2})年\d{1,2}月\d{1,2}日)/.exec(text);
    const kind = (/(判決|決定|命令)/.exec(text.slice(court.index + court[0].length, court.index + court[0].length + 200)) || [, "判決"])[1];
    const tail = rep ? `${rep[1]}${rep[2] ? rep[2] + "巻" : ""}${rep[3]}号${rep[4]}頁` : `（${no[1]}${no[2] === "元" ? "元" : no[2]}年（${no[3]}）第${no[4]}号）`;
    const eraBase = { 明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018 };
    const dy = dateAfter && /^(明治|大正|昭和|平成|令和)(元|\d{1,2})/.exec(dateAfter[1]);
    const year = dy ? String(eraBase[dy[1]] + (dy[2] === "元" ? 1 : +dy[2])) : "";
    // Supreme Court decisions use the standard short form "最判昭和31年10月4日 集民23号349頁" (大法廷: 最大判, 決定: 最決).
    const sc = /^最高裁判所(第[一二三]小法廷|大法廷)?$/.exec(court[1]);
    if (sc && dateAfter) {
      const short = `最${sc[1] === "大法廷" ? "大" : ""}${kind === "判決" ? "判" : kind === "決定" ? "決" : "命"}`;
      return { cite: `${short}${dateAfter[1]} ${tail}`, year };
    }
    return { cite: `${court[1]}${kind}${dateAfter ? dateAfter[1] : ""}${tail}`, year };
  }

  // South Korea: "대법원 2023. 2. 2. 선고 2018다261773 판결" (en banc: "... 전원합의체 판결"); Constitutional Court
  // "헌재 2024. 8. 29. 2020헌마389 결정". The en-banc marker placement and the Constitutional Court form are UNVERIFIED.
  function detectKrCase(title, head) {
    const text = `${title} ${head}`;
    const dt = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./.exec(text);
    const date = dt ? `${dt[1]}. ${+dt[2]}. ${+dt[3]}.` : "";
    const hj = /\b(\d{4}헌[가-힣]{1,2}\d{1,6})/.exec(text);
    if (hj && /헌법재판소|헌재/.test(text)) return { cite: `헌재 ${date ? date + " " : ""}${hj[1]} 결정`, year: dt ? dt[1] : "" };
    const no = /\b(\d{4}[가-힣]{1,3}\d{1,6})\b/.exec(text);
    if (!/대법원/.test(text) || !no || !dt) return null;
    const en = /전원합의체/.test(text) ? "전원합의체 " : "";
    const kind = /\b결정\b|결정\s*$/.test(text.replace(/판결/g, "")) && !/판결/.test(text) ? "결정" : "판결";
    return { cite: `대법원 ${date} 선고 ${no[1]} ${en}${kind}`, year: dt[1] };
  }

  // China: "最高人民法院（2019）最高法民终123号民事判决书" (court + 案号 + document type; the number 123 is a placeholder, not a real case); guiding cases take the form "最高人民法院指导案例N号" (N = the case number).
  // Format is common practice, UNVERIFIED (no 案号 was fetched).
  function detectCnCase(title, head) {
    const text = `${title} ${head}`;
    const g = /指导(?:性)?案例\s*(\d{1,3})\s*号/.exec(text);
    const an = /[（(](\d{4})[）)]((?!年|第)[一-龥A-Za-z0-9]{2,20}?\d+号)/.exec(text);
    if (!an && !g) return null;
    // A guiding-case page (number in the title or at the very top) quotes lower-court 案号 in its body: the guiding-case cite wins.
    const gTop = /指导(?:性)?案例\s*(\d{1,3})\s*号/.exec(title) || /指导(?:性)?案例\s*(\d{1,3})\s*号/.exec(String(head).slice(0, 200));
    if (gTop) return { cite: `最高人民法院指导案例${gTop[1]}号`, year: "" };
    if (an) {
      // Court = the last court name before the 案号 (the issuing court), falling back to the first one anywhere.
      const courtRe = /(最高人民法院|[一-龥]{2,6}省高级人民法院|[一-龥]{2,6}(?:高级|中级|基层)人民法院|[一-龥]{2,4}知识产权法院)/g;
      let court = null, cm;
      const before = text.slice(0, an.index);
      while ((cm = courtRe.exec(before))) court = cm;
      if (!court) { courtRe.lastIndex = 0; court = courtRe.exec(text); }
      if (!court) return null;
      const dt = /(民事|刑事|行政|执行)(判决书|裁定书|调解书|决定书)/.exec(text);
      return { cite: `${court[1]}（${an[1]}）${an[2]}${dt ? dt[1] + dt[2] : ""}`, year: an[1] };
    }
    return { cite: `最高人民法院指导案例${g[1]}号`, year: "" };
  }

  // Russia: "Постановление Конституционного Суда РФ от 2 июля 2024 г. № 34-П" (common form, UNVERIFIED against an official guide;
  // verified only that mirror pages show "от <date> N 34-П"). Needs a "-П" number or a court word plus a decision number.
  const RU_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  function detectRuCase(title, head) {
    const text = `${title} ${head}`;
    const num = /(?:№|\bN)\s*(\d{1,3}-(?:П|О|ЭС\d{2}-\d+)|[АA]\d{2}-\d+\/\d{4}|\d{1,3}-[А-ЯЁ]{1,3}\d{0,2}-\d+)/.exec(text);
    if (!num) return null;
    // \w and \b are ASCII-only in JS, so Cyrillic needs explicit letter classes and the u flag.
    const kind = /(?<![\p{L}])(Постановление|Определение|Решение|Обзор)(?![\p{L}])/iu.exec(text);
    let court = "";
    if (/Конституционн\p{L}+\s+Суд\p{L}*|(?<![\p{L}])КС\s*РФ(?![\p{L}])/u.test(text)) court = "Конституционного Суда РФ";
    else if (/Верховн\p{L}+\s+Суд\p{L}*|(?<![\p{L}])ВС\s*РФ(?![\p{L}])/u.test(text)) court = "Верховного Суда РФ";
    else if (/Арбитражн\p{L}+\s+суд\p{L}*/iu.test(text)) court = "Арбитражного суда";
    else if (/Европейск\p{L}+\s+Суд\p{L}*/u.test(text)) court = "Европейского Суда по правам человека";
    if (!court) return null;
    const k = kind ? kind[1][0].toUpperCase() + kind[1].slice(1).toLowerCase() : "Постановление";
    const dl = /от\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s*г/i.exec(text);
    const ds = /от\s+(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
    let date = "", year = "";
    if (dl && RU_MONTHS.includes(dl[2].toLowerCase())) { date = `от ${+dl[1]} ${dl[2].toLowerCase()} ${dl[3]} г.`; year = dl[3]; }
    else if (ds && +ds[2] >= 1 && +ds[2] <= 12) { date = `от ${+ds[1]} ${RU_MONTHS[+ds[2] - 1]} ${ds[3]} г.`; year = ds[3]; }
    return { cite: `${k} ${court}${date ? " " + date : ""} № ${num[1]}`, year };
  }

  // Arabic jurisdictions (UAE-style appeal numbers): "الطعن رقم 1167 لسنة 2024 تجاري". No official citation form was found,
  // so this only reproduces the number as the page states it, with the court if named. UNVERIFIED.
  function detectArCase(title, head) {
    const text = `${title} ${head}`.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6F0));
    const m = /(الطعن|الطعون|القضية|الدعوى)\s*(?:رقم|رقـم)?\s*(\d{1,6})\s*(?:\/\s*\d+\s*)?(?:لسنة|لعام|سنة)\s*(\d{4})\s*(تجاري|مدني|إداري|جزائي|جنائي|عمالي|شرعي)?/.exec(text);
    if (!m) return null;
    const court = /(المحكمة الاتحادية العليا|محكمة التمييز|محكمة النقض|المحكمة العليا|محكمة التعقيب|المحكمة الدستورية العليا|المحكمة الدستورية)/.exec(text);
    return { cite: `${court ? court[1] + "، " : ""}${m[1]} رقم ${m[2]} لسنة ${m[3]}${m[4] ? " " + m[4] : ""}`, year: m[3] };
  }

  // Mexico: "Tesis 2a./J. 1/2021 (10a.), Segunda Sala, Décima Época, registro digital 2022825". The SCJN guide was not reachable;
  // field order follows the SJF localizer. UNVERIFIED.
  function detectMxCase(title, head) {
    const text = `${title} ${head}`.normalize("NFC");
    const reg = /(?:Registro digital|N[úu]mero de registro)\s*:?\s*(\d{6,7})/i.exec(text);
    // Jurisprudence ("2a./J. 1/2021", "P./J. 5/2020"), isolated theses of the Salas/Pleno ("1a. CXXX/2019", "P. II/2020") and of tribunales colegiados ("XXVII.1o.2 K").
    const tesis = /(?<![\p{L}\d])((?:\d+a\.\/J\.\s*\d+\/\d{4}|P\.\/J\.\s*\d+\/\d{4}|(?:P|\d+a)\.\s*[IVXLC]+\/\d{4}|[IVXL]+\.\d+o?\.(?:[A-Z]\.)?\d+\s*[A-Z]?)\s*\(\d+a\.\))/u.exec(text);
    if (!tesis) return null;
    const organ = /(Pleno de la Suprema Corte de Justicia de la Naci[óo]n|(?:Primera|Segunda) Sala|Pleno Regional[^,.;\n]{0,60}|(?:Primer|Segundo|Tercer|Cuarto|Quinto|Sexto|S[ée]ptimo|Octavo|Noveno|D[ée]cimo)[a-zéó ]{0,30}Tribunal Colegiado[^,.;\n]{0,70})/i.exec(text);
    const epoca = /((?:D[ée]cima|Und[ée]cima|Duod[ée]cima|Novena|Octava|S[ée]ptima)\s+[ÉE]poca)/i.exec(text);
    const tipo = !tesis ? "" : /\/J\./.test(tesis[1]) ? "jurisprudencia" : "tesis aislada";
    const parts = [tesis ? `Tesis ${tesis[1]}` : "", organ ? organ[1].trim() : "", epoca ? epoca[1] : "", tipo, reg ? `registro digital ${reg[1]}` : ""].filter(Boolean);
    return { cite: parts.join(", "), year: tesis ? (/\/(\d{4})/.exec(tesis[1]) || [])[1] || "" : "" };
  }

  // Colombia: "Corte Constitucional, sentencia T-086 de 2020" (expected form, UNVERIFIED). Accepts "T-086/20" and "T-086 de 2020".
  function detectCoCase(title, head) {
    const text = `${title} ${head}`;
    const m = /\b(SU|SV|T|C|A)-\s?(\d{1,4})\s*(?:\/|\s+de\s+)(\d{4}|\d{2})\b/.exec(text);
    if (!m) return null;
    // The court must be named in the title or near the top (a number like "C-131/12" elsewhere is not enough).
    const top = `${title} ${String(head).slice(0, 600)}`;
    const courtWord = /Corte Constitucional|corteconstitucional\.gov\.co/i.test(top) ? "Corte Constitucional"
      : /Corte Suprema de Justicia/i.test(top) ? "Corte Suprema de Justicia" : /Consejo de Estado/i.test(top) ? "Consejo de Estado" : "";
    if (!courtWord) return null;
    const y = m[3].length === 2 ? (+m[3] > 90 ? "19" : "20") + m[3] : m[3];
    const kind = m[1] === "A" ? "auto" : "sentencia";
    return { cite: `${courtWord}, ${kind} ${m[1]}-${m[2].padStart(3, "0")} de ${y}`, year: y };
  }

  // Argentina: CSJN, «Mendoza, Beatriz c/ Estado Nacional s/ daños», 8/7/2008, Fallos: 331:1622 (common practice; the Fallos
  // volume:page cite is the official collection, a "CSJ 000551/2021/RH001" docket is the fallback). Needs the court name plus a cite.
  function detectArgCase(title, head) {
    const text = `${title} ${head}`;
    // The court must be named in the title or near the top, not merely mentioned deeper in the text.
    if (!/Corte Suprema de Justicia de la Naci[óo]n|\bCSJN\b|\bCSJ\s+\d/.test(`${title} ${String(head).slice(0, 600)}`)) return null;
    const fl = /\bFallos:?\s*(\d{3})\s*[:,]\s*(\d{1,4})\b/i.exec(text);
    const dk = /\bCSJ\s+(\d{1,7}\/\d{4}(?:\/[A-Z]{1,3}\d{1,3})*)/.exec(text);
    if (!fl && !dk) return null;
    let y = "", date = "";
    // Prefer the date after "Buenos Aires," (where the Court signs) or just before "Fallos", else the first date.
    const bsas = /Buenos Aires,?\s*[^\n]{0,40}/i.exec(text);
    const fpos = /\bFallos\b/i.exec(text);
    const near = (bsas && bsas[0]) || (fpos ? text.slice(Math.max(0, fpos.index - 60), fpos.index + 60) : "");
    const dlRe = new RegExp(`(?<![\\p{L}\\d])(\\d{1,2})\\s+de\\s+(${ES_MONTHS.join("|")})\\s+de\\s+(\\d{4})`, "iu");
    const dnRe = /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/;
    const dl = dlRe.exec(near) || dlRe.exec(text);
    const dn = dnRe.exec(near) || dnRe.exec(text);
    if (dl) { date = `${+dl[1]}/${ES_MONTHS.indexOf(dl[2].toLowerCase()) + 1}/${dl[3]}`; y = dl[3]; }
    else if (dn && +dn[2] >= 1 && +dn[2] <= 12 && +dn[1] >= 1 && +dn[1] <= 31) { date = `${+dn[1]}/${+dn[2]}/${dn[3]}`; y = dn[3]; }
    // The caption: "X c/ Y s/ Z" in the title, else the first line of the page head that has that shape.
    const cap = (s) => /(?<![\p{L}])(?:c|s)\/\s*\S/u.test(s);
    const clean = (s) => s.replace(/\s*[|–—]\s*(?:Corte Suprema|CSJN|Fallos|SAIJ|Jurisprudencia).*$/i, "").replace(/\s+-\s+(?:Corte Suprema|CSJN|Fallos|SAIJ)\b.*$/i, "").replace(/[.\s]+$/, "").trim();
    let name = cap(title) ? clean(title) : "";
    if (!name) {
      const line = String(head).split(/\n/).map((l) => l.trim()).find((l) => l.length < 220 && /\sc\/\s|\ss\/\s/.test(l));
      if (line) name = clean(line);
    }
    const ref = fl ? `Fallos: ${fl[1]}:${fl[2]}` : `CSJ ${dk[1]}`;
    return { cite: ["CSJN", name ? `«${name}»` : "", date, ref].filter(Boolean).join(", "), year: y };
  }

  function normalizeMeta(data, now) {
    const raw = { ...(data.meta || {}) };
    // The top frame's head first, then the heads of iframes that hold matches (judgment text is often framed).
    raw.head = [raw.head || "", ...(data.frames || []).map((f) => f.head || "")].filter(Boolean).join("\n");
    const url = data.srcUrl || data.url || "";
    // A scholarly/OpenGraph title is clean; document.title usually has " - Site" on the end.
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}
    // Only a " | Site" / " - Site" tail that names the site is cut: "Title - A guide" keeps its subtitle.
    const siteWords = [raw.site, raw.publisher, host.split(".").slice(-2, -1)[0]].map((s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")).filter((s) => s.length > 2);
    const stripSite = (t) => t.replace(/\s+([|–—-])\s+([^|–—-]{2,40})$/, (all, sep, tail) => {
      const k = tail.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      return sep === "|" || siteWords.some((w) => k.includes(w) || w.includes(k)) ? "" : all;
    });
    const title = (clean(raw.title || "").trim() || stripSite(clean(data.title || "").trim()))
      .replace(/\s+[|–—-]\s+Wikipedia$/i, "");
    const pages = raw.firstPage ? (raw.lastPage && raw.lastPage !== raw.firstPage ? `${raw.firstPage}–${raw.lastPage}` : raw.firstPage) : "";
    const doiMatch = /10\.\d{4,9}\/\S+/.exec(raw.doi || "");
    const pubmed = /^pubmed$/i.test(String(raw.site || "").trim());
    // PubMed lowercases journal titles after the first word ("The New England journal of medicine").
    const SMALL = /^(?:a|an|and|as|at|but|by|for|in|of|on|or|the|to|vs|de|du|des|la|le|les|et|und|der|die|das|für|el|y|del|da|di|dei|e|og|och)$/;
    const titleCaseJournal = (s) => s.replace(/\p{L}[\p{L}'’]*/gu, (w, i) => {
      if (/\p{Lu}/u.test(w.slice(1))) return w;
      const el = w.match(/^(\p{Ll}{1,2}['’])(\p{Ll}.*)$/u); // d'urologie -> d'Urologie
      if (el) return el[1] + el[2][0].toUpperCase() + el[2].slice(1);
      return i > 0 && SMALL.test(w) ? w : w[0].toUpperCase() + w.slice(1);
    });
    return {
      authors: parseAuthors(raw.authors), title: title || host || url,
      date: parseDate(raw.date), site: clean(raw.site || raw.publisher || "").trim() || (data.isPdf ? "" : host),
      journal: pubmed ? titleCaseJournal(clean(raw.journal || "").trim()) : clean(raw.journal || "").trim(),
      // PubMed puts the NLM abbreviation ("N Engl J Med") in citation_publisher.
      journalAbbr: clean(raw.journalAbbrev || (pubmed && raw.journal && /^[\p{L}][\p{L}.\s&-]{1,40}$/u.test(String(raw.publisher || "").trim()) ? raw.publisher : "") || "").trim(),
      volume: raw.volume || "", issue: raw.issue || "", pages,
      doi: doiMatch ? mdUrl(doiMatch[0]) : "", url: mdUrl(url), isPdf: !!data.isPdf, now,
      legal: detectCase(title, String(raw.head || "")),
      legalUk: detectUkCase(title, String(raw.head || "")),
      legalCa: detectCaCase(title, String(raw.head || "")),
      legalAu: detectAuCase(title, String(raw.head || "")),
      legalIn: detectInCase(title, String(raw.head || "")),
      legalDe: detectDeCase(title, String(raw.head || "")),
      legalAt: detectAtCase(title, String(raw.head || "")),
      legalCh: detectChCase(title, String(raw.head || "")),
      legalFr: detectFrCase(title, String(raw.head || "")),
      legalIt: detectItCase(title, String(raw.head || "")),
      legalEs: detectEsCase(title, String(raw.head || "")),
      legalEu: detectEuCase(title, String(raw.head || "")),
      legalBr: detectBrCase(title, String(raw.head || "")),
      legalPt: detectPtCase(title, String(raw.head || "")),
      legalJp: detectJpCase(title, String(raw.head || "")),
      legalKr: detectKrCase(title, String(raw.head || "")),
      legalCn: detectCnCase(title, String(raw.head || "")),
      legalRu: detectRuCase(title, String(raw.head || "")),
      legalAr: detectArCase(title, String(raw.head || "")),
      legalAg: detectArgCase(title, String(raw.head || "")),
      legalMx: detectMxCase(title, String(raw.head || "")),
      legalCo: detectCoCase(title, String(raw.head || "")),
    };
  }

  // In-text marker for one quote. n: reference number for the numbered styles.
  function marker(style, m, page) {
    const A = m.authors;
    const y = m.date ? String(m.date.y) : "n.d.";
    const sn = A.map((a) => a.family);
    const noAuthor = shortTitle(m.title);
    const p = page ? String(page) : "";
    if (style === "ieee") return p ? `[1, p. ${p}]` : "[1]";
    if (style === "vancouver") return p ? `(1, p. ${p})` : "(1)";
    if (style === "ama") return `${SUPER[1]}${p ? ` (p. ${p})` : ""}`;
    // A case's pin cite is the reporter page, which a slip-opinion PDF/web page doesn't show: no pin cite then.
    if (style === "bluebook") return m.legal ? "" : p ? `(at ${p})` : "";
    if (style === "oscola" || style === "mcgill" || style === "aglc" || style === "india" || style === "de" || style === "at" || style === "ch" || style === "fr" || style === "it" || style === "es" || style === "eu" || style === "br" || style === "pt" || style === "jp" || style === "kr" || style === "cn" || style === "ru" || style === "ar" || style === "mx" || style === "co" || style === "ag") return "";
    if (style === "plain") return p ? `(p. ${p})` : "";
    const names = (s) => {
      if (!sn.length) return null;
      if (sn.length === 1) return sn[0];
      if (s === "chicago") return sn.length >= 4 ? `${sn[0]} et al.` : listAnd(sn, ", ", "and");
      return sn.length === 2 ? `${sn[0]} ${s === "apa" ? "&" : "and"} ${sn[1]}` : `${sn[0]} et al.`;
    };
    const w = names(style);
    if (style === "apa") return `(${w || `“${noAuthor}”`}, ${y}${p ? `, p. ${p}` : ""})`;
    if (style === "harvard") return `(${w || `‘${noAuthor}’`}, ${y}${p ? `, p. ${p}` : ""})`;
    if (style === "chicago") return `(${w || `“${noAuthor}”`} ${y}${p ? `, ${p}` : ""})`;
    return `(${w || `“${noAuthor}”`}${p ? ` ${p}` : ""})`; // mla
  }

  // One reference entry, as Markdown (esc() for text, *x* for italics, <url> for links).
  function reference(style, m) {
    const e = esc;
    const A = m.authors;
    const d = m.date;
    const link = m.doi ? `<https://doi.org/${m.doi}>` : `<${m.url}>`;
    const acc = m.now;
    const t = clean(m.title);
    const ends = (s) => (/[.?!]$/.test(s) ? s : s + ".");
    const site = m.site && !A.some((a) => a.family === m.site) ? m.site : "";
    const j = !!m.journal;

    if (style === "apa") {
      const names = A.map((a) => (a.org || !a.given ? a.family : `${a.family}, ${initials(a.given, true, " ")}`));
      const author = names.length > 20 ? [...names.slice(0, 19), `… ${names[names.length - 1]}`].join(", ") : names.length > 1 ? `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}` : names[0] || "";
      const dt = !d ? "n.d." : j || !d.m ? String(d.y) : `${d.y}, ${MONTHS[d.m - 1]}${d.d ? " " + d.d : ""}`;
      const lead = author ? `${e(dot(author))} (${dt}). ` : "";
      if (j) return `${lead || ""}${e(ends(t))} *${e(m.journal)}*${m.volume ? `, *${e(m.volume)}*` : ""}${m.issue ? `(${e(m.issue)})` : ""}${m.pages ? `, ${e(m.pages)}` : ""}. ${link}`;
      return `${lead || `*${e(dot(t))}* (${dt}). `}${author ? `*${e(dot(t))}* ` : ""}${site ? e(dot(site)) + " " : ""}${link}`.replace(/\s+/g, " ");
    }
    if (style === "mla") {
      const names = !A.length ? "" : A.length === 1 ? inverted(A[0]) : A.length === 2 ? `${inverted(A[0])}, and ${natural(A[1])}` : `${inverted(A[0])}, et al.`;
      const date = !d ? "" : d.d ? `${d.d} ${M_DOT[d.m - 1]} ${d.y}` : d.m ? `${M_DOT[d.m - 1]} ${d.y}` : String(d.y);
      const parts = [j ? `*${e(m.journal)}*` : site ? `*${e(site)}*` : "", m.volume && j ? `vol. ${e(m.volume)}` : "", m.issue && j ? `no. ${e(m.issue)}` : "",
        date ? e(date) : "", m.pages ? `pp. ${e(m.pages)}` : "", link].filter(Boolean);
      const accessed = `${acc.getDate()} ${M_DOT[acc.getMonth()]} ${acc.getFullYear()}`;
      return `${names ? e(dot(names)) + " " : ""}“${e(/[.?!]$/.test(t) ? t : t + ".")}” ${parts.join(", ")}. ${m.doi ? "" : "Accessed " + accessed + "."}`.replace(/\s+/g, " ").trim();
    }
    if (style === "chicago") {
      const shown = A.slice(0, A.length > 10 ? 7 : A.length).map((a, i) => (i ? natural(a) : inverted(a)));
      const names = A.length > 10 ? `${shown.join(", ")}, et al.` : shown.length === 2 ? `${shown[0]}, and ${shown[1]}` : listAnd(shown, ", ", "and");
      const y = d ? String(d.y) : "n.d.";
      const full = d && d.m && d.d && !j ? ` ${MONTHS[d.m - 1]} ${d.d}, ${d.y}.` : "";
      const ttl = `“${e(ends(t))}”`;
      const body = j
        ? `*${e(m.journal)}*${m.volume ? ` ${e(m.volume)}` : ""}${m.issue ? ` (${e(m.issue)})` : ""}${m.pages ? `: ${e(m.pages)}` : ""}.`
        : `${site ? e(dot(site)) : ""}${full}`;
      // No author: the title takes the author's place, ahead of the year.
      return (names ? `${e(dot(names))} ${y}. ${ttl} ${body} ${link}.` : `${ttl} ${y}. ${body} ${link}.`).replace(/\s+/g, " ");
    }
    if (style === "harvard") {
      const one = (a) => (a.org || !a.given ? a.family : `${a.family}, ${initials(a.given, true, "")}`);
      const names = A.length >= 4 ? `${one(A[0])} et al.` : listAnd(A.map(one), ", ", "and");
      const y = d ? String(d.y) : "n.d.";
      const dm = d && d.m && d.d && !j ? `, ${d.d} ${MONTHS[d.m - 1]}` : "";
      const acc2 = `${acc.getDate()} ${MONTHS[acc.getMonth()]} ${acc.getFullYear()}`;
      const body = j
        ? `‘${e(t)}’, *${e(m.journal)}*${m.volume ? `, ${e(m.volume)}` : ""}${m.issue ? `(${e(m.issue)})` : ""}${m.pages ? `, pp. ${e(m.pages)}` : ""}.${m.doi ? ` doi:${e(m.doi)}.` : ""}`
        : `‘${e(t)}’${site ? `, *${e(site)}*` : ""}${dm}. Available at: <${m.url}> (Accessed: ${acc2}).`;
      return `${names ? e(names) + " " : ""}(${y}) ${body}`.replace(/\s+/g, " ");
    }
    if (style === "ieee") {
      const one = (a) => (a.org || !a.given ? a.family : `${initials(a.given, true, " ")} ${a.family}`);
      const names = A.length > 6 ? `${one(A[0])} et al.` : listAnd(A.map(one), ", ", "and");
      const date = !d ? "" : d.m ? `${M_IEEE[d.m - 1]} ${d.d ? d.d + ", " : ""}${d.y}` : String(d.y);
      const body = j
        ? `“${e(t)},” *${e(m.journal)}*${m.volume ? `, vol. ${e(m.volume)}` : ""}${m.issue ? `, no. ${e(m.issue)}` : ""}${m.pages ? `, pp. ${e(m.pages)}` : ""}${date ? `, ${e(date)}` : ""}${m.doi ? `, doi: ${e(m.doi)}` : ""}.`
        : `“${e(t)},”${site ? ` *${e(site)}*,` : ""}${date ? ` ${e(date)}.` : ""} [Online]. Available: <${m.url}>`;
      return `\\[1\\] ${names ? e(names) + ", " : ""}${body}`.replace(/\s+/g, " ");
    }
    if (style === "vancouver" || style === "ama") {
      const one = (a) => (a.org || !a.given ? a.family : `${a.family} ${initials(a.given, false, "")}`);
      const cap = style === "ama" ? 3 : 6;
      const names = A.length > 6 ? `${A.slice(0, cap).map(one).join(", ")}, et al` : A.map(one).join(", ");
      const authors = names ? e(dot(names)) + " " : "";
      if (j) {
        const vol = `${d ? d.y : ""}${m.volume ? `;${e(m.volume)}` : ""}${m.issue ? `(${e(m.issue)})` : ""}${m.pages ? `:${e(m.pages.replace("–", "-"))}` : ""}`;
        const jn = m.journalAbbr || m.journal;
        return `1. ${authors}${e(ends(t))} ${style === "ama" ? `*${e(dot(jn))}*` : e(dot(jn))} ${vol}.${m.doi ? ` doi:${e(m.doi)}` : ""}`.replace(/\s+/g, " ");
      }
      if (style === "ama") {
        const pub = d ? ` Published ${d.m ? MONTHS[d.m - 1] + " " : ""}${d.d ? d.d + ", " : ""}${d.y}.` : "";
        return `1. ${authors}${e(ends(t))}${site ? ` ${e(dot(site))}` : ""}${pub} Accessed ${MONTHS[acc.getMonth()]} ${acc.getDate()}, ${acc.getFullYear()}. <${m.url}>`.replace(/\s+/g, " ");
      }
      const pub = d ? `${d.y}${d.m ? " " + M_3[d.m - 1] : ""}${d.d ? " " + d.d : ""}` : "";
      return `1. ${authors}${e(t)} [Internet]. ${site ? e(site) + (pub ? "; " : "") : ""}${e(pub)} [cited ${acc.getFullYear()} ${M_3[acc.getMonth()]} ${acc.getDate()}]. Available from: <${m.url}>`.replace(/\s+/g, " ");
    }
    if (style === "aglc") {
      if (m.legalAu) return `*${e(m.legalAu.name)}* ${e(m.legalAu.cite)}.`;
      // AGLC4 web page: Author, 'Title' (Website, Day Month Year) <URL>.
      const names = A.length > 3 ? `${natural(A[0])} et al` : listAnd(A.map(natural), ", ", "and");
      const when = d ? `${d.d ? d.d + " " : ""}${d.m ? MONTHS[d.m - 1] + " " : ""}${d.y}` : "";
      const pub = [site, when].filter(Boolean).join(", ");
      return `${names ? e(names) + ", " : ""}‘${e(clean(t))}’${pub ? ` (${e(pub)})` : ""} <${m.url}>.`.replace(/\s+/g, " ");
    }
    if (style === "india") {
      if (m.legalIn) return `*${e(m.legalIn.name)}*${m.legalIn.hasReporter ? " " : ", "}${e(m.legalIn.cite)}.`;
      // No Indian web-page rule was verified: author, ‘Title’ (Site, date) <URL>, as in OSCOLA/AGLC.
      const names = A.length > 3 ? `${natural(A[0])} and others` : listAnd(A.map(natural), ", ", "and");
      const when = d ? `${d.d ? d.d + " " : ""}${d.m ? MONTHS[d.m - 1] + " " : ""}${d.y}` : "";
      const pub = [site, when].filter(Boolean).join(", ");
      return `${names ? e(names) + ", " : ""}‘${e(clean(t))}’${pub ? ` (${e(pub)})` : ""} <${m.url}> accessed ${acc.getDate()} ${MONTHS[acc.getMonth()]} ${acc.getFullYear()}`.replace(/\s+/g, " ");
    }
    if (style === "it" || style === "es") {
      const L = style === "it" ? m.legalIt : m.legalEs;
      if (L) return `${e(L.cite)}.`;
      const MN = style === "it" ? IT_MONTHS : ES_MONTHS;
      const names = A.length > 3 ? `${inverted(A[0])} et al.` : listAnd(A.map((a, i) => (i ? natural(a) : inverted(a))), ", ", style === "it" ? "e" : "y");
      const when = d ? `${d.d ? d.d + (style === "es" ? " de " : " ") : ""}${d.m ? MN[d.m - 1] + (style === "es" ? " de " : " ") : ""}${d.y}` : "";
      const got = style === "es" ? `consultado el ${acc.getDate()} de ${MN[acc.getMonth()]} de ${acc.getFullYear()}` : `consultato il ${acc.getDate()} ${MN[acc.getMonth()]} ${acc.getFullYear()}`;
      return [names ? e(names) : "", `«${e(clean(t))}»`, site ? e(site) : "", when ? e(when) : ""].filter(Boolean).join(", ") + `, <${m.url}> (${got}).`;
    }
    if (style === "mx" || style === "co" || style === "ag") {
      const L = style === "mx" ? m.legalMx : style === "ag" ? m.legalAg : m.legalCo;
      if (L) return `${e(L.cite)}.`;
      const names = A.length > 3 ? `${inverted(A[0])} et al.` : listAnd(A.map((a, i) => (i ? natural(a) : inverted(a))), ", ", "y");
      const when = d ? `${d.d ? d.d + " de " : ""}${d.m ? ES_MONTHS[d.m - 1] + " de " : ""}${d.y}` : "";
      return [names ? e(names) : "", `“${e(clean(t))}”`, site ? e(site) : "", when ? e(when) : ""].filter(Boolean).join(", ") + `, <${m.url}> (consultado el ${acc.getDate()} de ${ES_MONTHS[acc.getMonth()]} de ${acc.getFullYear()}).`;
    }
    if (style === "ru") {
      if (m.legalRu) return `${e(m.legalRu.cite)}.`;
      const names = A.length > 3 ? `${natural(A[0])} и др.` : A.map(inverted).join(", ");
      const when = d ? `${d.d ? d.d + " " + RU_MONTHS[(d.m || 1) - 1] + " " : d.m ? RU_MONTHS[d.m - 1] + " " : ""}${d.y}` : "";
      return `${names ? e(names) + " " : ""}${e(clean(t))}${site ? " // " + e(site) : ""}${when ? ". " + e(when) : ""}. URL: ${m.url} (дата обращения: ${String(acc.getDate()).padStart(2, "0")}.${String(acc.getMonth() + 1).padStart(2, "0")}.${acc.getFullYear()}).`;
    }
    if (style === "ar") {
      if (m.legalAr) return `${e(m.legalAr.cite)}.`;
      const names = A.length > 3 ? `${natural(A[0])} وآخرون` : A.map(natural).join("، ");
      return [names ? e(names) : "", `«${e(clean(t))}»`, site ? e(site) : "", d ? String(d.y) : ""].filter(Boolean).join("، ") + `، <${m.url}> (تاريخ الاطلاع: ${acc.getDate()}/${acc.getMonth() + 1}/${acc.getFullYear()}).`;
    }
    if (style === "jp" || style === "kr" || style === "cn") {
      const L = style === "jp" ? m.legalJp : style === "kr" ? m.legalKr : m.legalCn;
      if (L) return style === "kr" ? e(L.cite) : `${e(L.cite)}${style === "cn" ? "。" : ""}`;
      const names = A.length > 3 ? `${natural(A[0])} ${style === "jp" ? "ほか" : style === "kr" ? "외" : "等"}` : A.map(natural).join(style === "jp" ? "・" : style === "kr" ? ", " : "，");
      if (style === "jp") {
        const when = d ? `${d.y}年${d.m ? d.m + "月" : ""}${d.d ? d.d + "日" : ""}` : "";
        return `${names ? e(names) + "、" : ""}「${e(clean(t))}」${site || when ? `（${[site ? e(site) : "", when].filter(Boolean).join("、")}）` : ""}<${m.url}>（最終閲覧日：${acc.getFullYear()}年${acc.getMonth() + 1}月${acc.getDate()}日）`;
      }
      if (style === "kr") {
        const when = d ? `${d.y}${d.m ? ". " + d.m : ""}${d.d ? ". " + d.d : ""}.` : "";
        return [names ? e(names) : "", `「${e(clean(t))}」`, site ? e(site) : "", when].filter(Boolean).join(", ") + `, <${m.url}> (최종확인 ${acc.getFullYear()}. ${acc.getMonth() + 1}. ${acc.getDate()}.)`;
      }
      const when = d ? `${d.y}年${d.m ? d.m + "月" : ""}${d.d ? d.d + "日" : ""}` : "";
      return `${names ? e(names) + "：" : ""}《${e(clean(t))}》${site ? "，载" + e(site) : ""}${when ? "，" + when : ""}，<${m.url}>，最后访问日期：${acc.getFullYear()}年${acc.getMonth() + 1}月${acc.getDate()}日。`;
    }
    if (style === "br" || style === "pt") {
      const L = style === "br" ? m.legalBr : m.legalPt;
      if (L) return `${e(L.cite)}.`;
      // ABNT-style web page: SOBRENOME, Nome. Título. Site, data. Disponível em: <URL>. Acesso em: d mês. aaaa.
      const up = (a) => { const s = inverted(a); const i = s.indexOf(","); return i < 0 ? s : s.slice(0, i).toUpperCase() + s.slice(i); };
      const names = A.length > 3 ? `${up(A[0])} et al.` : A.map(up).join("; ");
      const ab = (i) => PT_MONTHS[i].length > 4 ? PT_MONTHS[i].slice(0, 3) + "." : PT_MONTHS[i];
      const when = d ? `${d.d ? d.d + " " : ""}${d.m ? ab(d.m - 1) + " " : ""}${d.y}` : "";
      const head = [names ? dot(e(names)) : "", dot(e(clean(t)))].filter(Boolean).join(" ");
      const pubTxt = [site ? e(site) : "", when ? e(when) : ""].filter(Boolean).join(", ");
      return `${head}${pubTxt ? " " + pubTxt + "." : ""} Disponível em: <${m.url}>. Acesso em: ${acc.getDate()} ${ab(acc.getMonth())} ${acc.getFullYear()}.`.replace(/\s+/g, " ");
    }
    if (style === "eu") {
      if (m.legalEu) return `${e(m.legalEu.cite)}.`;
      const names = A.length > 3 ? `${natural(A[0])} and others` : listAnd(A.map(natural), ", ", "and");
      const pub = [site, d ? `${d.d ? d.d + " " : ""}${d.m ? MONTHS[d.m - 1] + " " : ""}${d.y}` : ""].filter(Boolean).join(", ");
      return `${names ? e(names) + ", " : ""}‘${e(clean(t))}’${pub ? ` (${e(pub)})` : ""} <${m.url}> accessed ${acc.getDate()} ${MONTHS[acc.getMonth()]} ${acc.getFullYear()}`.replace(/\s+/g, " ");
    }
    if (style === "fr") {
      if (m.legalFr) return `${e(m.legalFr.cite)}.`;
      const names = A.length > 3 ? `${inverted(A[0])} et al.` : listAnd(A.map((a, i) => (i ? natural(a) : inverted(a))), ", ", "et");
      const when = d ? `${d.d ? d.d + " " : ""}${d.m ? FR_MONTHS[d.m - 1] + " " : ""}${d.y}` : "";
      return [names ? e(names) : "", `« ${e(clean(t))} »`, site ? e(site) : "", when ? e(when) : ""].filter(Boolean).join(", ")
        + `, <${m.url}> (consulté le ${acc.getDate()} ${FR_MONTHS[acc.getMonth()]} ${acc.getFullYear()}).`;
    }
    if (style === "de" || style === "at" || style === "ch") {
      const L = style === "at" ? m.legalAt : style === "ch" ? m.legalCh : m.legalDe;
      if (L) return style === "de" ? `${e(L.cite)}.` : e(L.cite);
      // Web page, German practice: Nachname, Vorname, Titel, Website, Datum, <URL> (abgerufen am dd.mm.yyyy).
      const names = A.length > 3 ? `${inverted(A[0])} u. a.` : listAnd(A.map((a, i) => (i ? natural(a) : inverted(a))), "; ", "und");
      const when = d ? `${d.d ? String(d.d).padStart(2, "0") + "." : ""}${d.m ? String(d.m).padStart(2, "0") + "." : ""}${d.y}` : "";
      const got = `${String(acc.getDate()).padStart(2, "0")}.${String(acc.getMonth() + 1).padStart(2, "0")}.${acc.getFullYear()}`;
      return [names ? e(names) : "", e(clean(t)), site ? e(site) : "", when ? e(when) : ""].filter(Boolean).join(", ") + `, <${m.url}> (abgerufen am ${got}).`;
    }
    if (style === "mcgill") {
      if (m.legalCa) return `*${e(m.legalCa.name)}*, ${e(m.legalCa.cite)}.`;
      const names = A.length > 3 ? `${inverted(A[0])}, et al` : listAnd(A.map((a, i) => (i ? natural(a) : inverted(a))), ", ", "and");
      const date = d ? `${d.y}${d.m ? "-" + String(d.m).padStart(2, "0") : ""}${d.d ? "-" + String(d.d).padStart(2, "0") : ""}` : "";
      return `${names ? e(dot(names)) + " " : ""}“${e(clean(t))}”${date ? ` (${e(date)})` : ""}${site ? `, online: ${e(site)}` : ", online"} <${m.url}>`.replace(/\s+/g, " ");
    }
    if (style === "oscola") {
      if (m.legalUk) return `*${e(m.legalUk.name)}* ${e(m.legalUk.cite)}.`;
      const names = A.length > 3 ? `${natural(A[0])} and others` : listAnd(A.map(natural), ", ", "and");
      const pub = [site, d ? `${d.d ? d.d + " " : ""}${d.m ? MONTHS[d.m - 1] + " " : ""}${d.y}` : ""].filter(Boolean).join(", ");
      return `${names ? e(names) + ", " : ""}‘${e(t)}’${pub ? ` (${e(pub)})` : ""} <${m.url}> accessed ${acc.getDate()} ${MONTHS[acc.getMonth()]} ${acc.getFullYear()}`.replace(/\s+/g, " ");
    }
    if (style === "bluebook" && m.legal) {
      const L = m.legal;
      return `*${e(L.name)}*, ${e(L.cite)} (${e(L.year || (d ? String(d.y) : "") || "n.d.")}).`;
    }
    if (style === "bluebook") {
      const names = A.length === 1 ? natural(A[0]) : A.length === 2 ? `${natural(A[0])} & ${natural(A[1])}` : A.length > 2 ? `${natural(A[0])} et al.` : "";
      const date = !d ? "" : `${d.m ? M_DOT[d.m - 1] + " " : ""}${d.d ? d.d + ", " : ""}${d.y}`;
      if (j) { // periodical: Author, Title, vol. JOURNAL first-page (year)
        const first = m.pages ? m.pages.split("–")[0] : "";
        const cite = [m.volume && e(m.volume), e(m.journal.toUpperCase()), first && e(first)].filter(Boolean).join(" ");
        return `${names ? e(names) + ", " : ""}${e(t)}, ${cite}${d ? ` (${d.y})` : ""}${m.doi ? `, ${link}` : ""}.`.replace(/\s+/g, " ");
      }
      const sitePart = site ? site.toUpperCase() : "";
      const tail = [sitePart ? e(sitePart) : "", date ? `(${e(date)})` : ""].filter(Boolean).join(" ");
      return `${names ? e(names) + ", " : ""}${e(t)}${tail ? ", " + tail : ""}, <${m.url}>.`.replace(/\s+/g, " ");
    }
    // plain
    const names = A.map(natural).join(", ");
    const date = !d ? "" : `${d.d ? d.d + " " : ""}${d.m ? MONTHS[d.m - 1] + " " : ""}${d.y}`;
    const iso = `${acc.getFullYear()}-${String(acc.getMonth() + 1).padStart(2, "0")}-${String(acc.getDate()).padStart(2, "0")}`;
    return [names && e(dot(names)), e(dot(t)), (j ? m.journal : site) && e(dot(j ? m.journal : site)), date && e(dot(date)), link, `(accessed ${iso})`]
      .filter(Boolean).join(" ");
  }

  // Scroll-to-text link (#:~:text=) for a quote on a web page; "" when it can't work (PDF, iframe, non-http).
  // Long quotes use the start,end form so the URL stays short. "-", ",", "&" and brackets are percent-encoded.
  function textFragmentUrl(pageUrl, text) {
    if (!/^https?:/i.test(pageUrl || "")) return "";
    const enc = (s) => encodeURIComponent(s).replace(/[-!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    const frag = words.length <= 10 ? enc(words.join(" ")) : `${enc(words.slice(0, 5).join(" "))},${enc(words.slice(-5).join(" "))}`;
    return `${pageUrl.replace(/#.*$/, "")}#:~:text=${frag}`;
  }

  // opts: { mode: "snippet" | "sentence" | "paragraph", style: one of CITE_STYLES, now?: Date }
  function toCitations(data, terms, labels, opts = {}) {
    const style = CITE_STYLES.includes(opts.style) ? opts.style : "apa";
    const mode = opts.mode === "sentence" || opts.mode === "paragraph" ? opts.mode : "snippet";
    const m = normalizeMeta(data, opts.now || new Date());
    const all = [...data.rows.map((r) => ({ ...r, frame: null, blocks: data.blocks }))];
    for (const f of data.frames || []) for (const r of f.rows) all.push({ ...r, frame: f.url, blocks: f.blocks });
    const hasUnreadable = new RegExp(UNREADABLE.source);

    const seen = new Set();
    const quotes = [];
    const body = all.filter((r) => !r.aux);
    for (const r of body.length ? body : all) {
      let text;
      let cutL;
      let cutR;
      if (mode === "snippet") { text = r.before + r.hit + r.after; cutL = r.cutL; cutR = r.cutR; } else {
        const p = passageOf(r, r.blocks, mode);
        text = p.text; cutL = p.cutL; cutR = p.cutR;
      }
      text = clean(text).trim();
      if (!text) continue;
      const id = `${r.frame || ""}\u0000${r.page || 0}\u0000${text}`;
      if (seen.has(id)) continue;
      seen.add(id);
      quotes.push({ text, cutL, cutR, page: r.page || 0, web: !r.frame && !data.isPdf });
    }
    const unreadable = quotes.filter((q) => hasUnreadable.test(q.text)).length;

    let md = `# ${labels.citeTitle || "Citations"}: ${esc(clean(m.title).trim())}\n`;
    if (data.scanned) md += `\n> ${labels.scanned}\n`;
    if (unreadable) md += `\n> ${labels.unreadable.replace("{n}", String(unreadable))}\n`;
    md += `\n## ${labels.citeQuotes || "Quotes"} (${quotes.length})\n\n`;
    if (!quotes.length) md += `_${labels.none}_\n`;
    for (const q of quotes.slice(0, MAX_PER_TERM)) {
      const mk = marker(style, m, q.page);
      const tf = q.web ? textFragmentUrl(m.url, q.text) : "";
      md += `- “${q.cutL ? "[…] " : ""}${esc(q.text)}${q.cutR ? " […]" : ""}”${mk ? " " + esc(mk) : ""}${tf ? ` [↗](${tf})` : ""}\n`;
    }
    if (quotes.length > MAX_PER_TERM) md += `- _… ${quotes.length - MAX_PER_TERM} ${labels.more}_\n`;
    md += `\n## ${labels.citeReference || "Reference"}\n\n${reference(style, m)}\n`;
    return md;
  }

  // Passages in document order (deduped), each with the terms it holds, its heading and page.
  function orderedPassages(data, terms, opts) {
    const mode = opts.mode === "snippet" || opts.mode === "paragraph" ? opts.mode : "sentence";
    const all = [...data.rows.map((r) => ({ ...r, frame: null, blocks: data.blocks }))];
    for (const f of data.frames || []) for (const r of f.rows) all.push({ ...r, frame: f.url, blocks: f.blocks });
    const display = new Map(terms.map((t) => [t.toLowerCase(), t]));
    const seen = new Map();
    for (const r of all) {
      let p;
      if (mode === "snippet") p = { text: r.before + r.hit + r.after, hs: r.before.length, he: r.before.length + r.hit.length, cutL: r.cutL, cutR: r.cutR };
      else p = passageOf(r, r.blocks, mode);
      const id = `${r.frame || ""}\u0000${r.page || 0}\u0000${p.text}`;
      let e = seen.get(id);
      if (!e) { e = { ...p, page: r.page || 0, line: r.line, heading: r.heading || "", keys: new Set(), hits: new Map() }; seen.set(id, e); }
      e.keys.add((r.term || "").toLowerCase());
      e.hits.set(`${p.hs}:${p.he}`, [p.hs, p.he]);
    }
    return { list: [...seen.values()], display, all };
  }

  const passageText = (p) => `${p.cutL ? "…" : ""}${boldHits(p.text, p.hits.values())}${p.cutR ? "…" : ""}`;

  // Research notes: passages in reading order, each tagged with its heading, under a source block.
  function toResearch(data, terms, labels, opts = {}) {
    const m = normalizeMeta(data, new Date());
    const { list, display } = orderedPassages(data, terms, opts);
    const people = m.authors.map((a) => (a.org ? a.family : [a.given, a.family].filter(Boolean).join(" "))).join(", ");
    let md = `# ${labels.researchTitle || "Research notes"}: ${esc(clean(m.title).trim())}\n\n`;
    if (people) md += `- **${labels.researchAuthor || "Author"}:** ${esc(people)}\n`;
    if (m.date) md += `- **${labels.researchDate || "Date"}:** ${m.date.y}\n`;
    if (m.url) md += `- **${labels.source || "Source"}:** <${m.url}>\n`;
    if (data.scanned) md += `\n> ${labels.scanned}\n`;
    md += `\n## ${labels.passages || "Passages"} (${list.length})\n\n`;
    if (!list.length) md += `_${labels.none}_\n`;
    for (const p of list.slice(0, MAX_PER_TERM)) {
      const tags = [...p.keys].map((k) => esc(display.get(k) || k)).join(", ");
      const where = [p.heading ? `§ ${esc(p.heading)}` : "", p.page ? `${labels.page}${p.page}` : ""].filter(Boolean).join(", ");
      md += `- ${passageText(p)}${where || tags ? ` *(${[where, tags].filter(Boolean).join(" · ")})*` : ""}\n`;
    }
    if (list.length > MAX_PER_TERM) md += `- _… ${list.length - MAX_PER_TERM} ${labels.more}_\n`;
    return md;
  }

  // Resume screen: which terms were found (with counts), then matching lines under their section.
  function toResume(data, terms, labels, opts = {}) {
    const { list, display, all } = orderedPassages(data, terms, { ...opts, mode: opts.mode === "paragraph" ? "paragraph" : "sentence" });
    const counts = new Map(terms.map((t) => [t.toLowerCase(), 0]));
    for (const r of all) { const k = (r.term || "").toLowerCase(); if (counts.has(k)) counts.set(k, counts.get(k) + 1); }
    const found = [...counts.values()].filter(Boolean).length;
    const name = clean(data.title || "").trim().replace(/\.pdf$/i, "") || data.srcUrl || data.url || "";
    let md = `# ${labels.resumeTitle || "Resume screen"}: ${esc(name)}\n`;
    if (data.scanned) md += `\n> ${labels.scanned}\n`;
    md += `\n## ${labels.resumeCoverage || "Coverage"} (${found}/${counts.size})\n\n`;
    for (const [k, n] of counts) md += `- ${n ? "✓" : "✗"} ${esc(display.get(k) || k)}${n ? ` (${n})` : ""}\n`;
    const sections = new Map();
    for (const p of list) {
      const h = p.heading || labels.resumeOther || "Other";
      if (!sections.has(h)) sections.set(h, []);
      sections.get(h).push(p);
    }
    for (const [h, ps] of sections) {
      md += `\n## ${esc(h)}\n\n`;
      for (const p of ps.slice(0, MAX_PER_TERM)) md += `- ${passageText(p)}\n`;
    }
    return md;
  }

  // The Markdown for the chosen preset: the default term-grouped matches, citations, research notes or resume screen.
  const render = (data, terms, labels, opts = {}) => {
    if (opts.preset === "citation" || opts.preset === "legal") return toCitations(data, terms, labels, opts);
    if (opts.preset === "research") return toResearch(data, terms, labels, opts);
    if (opts.preset === "resume") return toResume(data, terms, labels, opts);
    return toMarkdown(data, terms, labels, opts);
  };

  // ---- rich text ----------------------------------------------------------------
  // Converts the Markdown that toMarkdown() emits (a small, known subset) to HTML so
  // Word / Google Docs / Outlook paste real headings, lists and bold hits.
  const htmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Inline Markdown subset -> semantic HTML: **bold** -> <b>, *italic* -> <i>, `code`,
  // <url> -> <a>, backslash escapes.
  function inlineSemantic(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\" && i + 1 < s.length) { out += htmlEsc(s[++i]); continue; }
      if (c === "*" && s[i + 1] === "*") {
        const j = s.indexOf("**", i + 2);
        if (j > i) { out += `<b>${inlineSemantic(s.slice(i + 2, j))}</b>`; i = j + 1; continue; }
      }
      if (c === "*") {
        const j = s.indexOf("*", i + 1);
        if (j > i) { out += `<i>${inlineSemantic(s.slice(i + 1, j))}</i>`; i = j; continue; }
      }
      if (c === "`") {
        const j = s.indexOf("`", i + 1);
        if (j > i) { out += `<code>${htmlEsc(s.slice(i + 1, j))}</code>`; i = j; continue; }
      }
      if (c === "[" && s[i + 1] === "↗" && s[i + 2] === "]" && s[i + 3] === "(") {
        const j = s.indexOf(")", i + 4);
        const u = j > 0 ? s.slice(i + 4, j) : "";
        if (/^https?:/i.test(u)) { out += `<a href="${htmlEsc(u)}">↗</a>`; i = j; continue; }
      }
      if (c === "<") {
        const j = s.indexOf(">", i + 1);
        if (j > i) {
          const u = s.slice(i + 1, j);
          // Only real web/file addresses become links (no javascript:, data:, ...).
          out += /^(?:https?|file):/i.test(u) ? `<a href="${htmlEsc(u)}">${htmlEsc(u)}</a>` : htmlEsc(u);
          i = j; continue;
        }
      }
      out += htmlEsc(c);
    }
    return out;
  }

  // Plain, conventional HTML (h1/h2, ul/li, b, a, code) with no inline styling, so each
  // target app applies its own fonts. Paste into a blank document: Word carries over the
  // formatting at the cursor, which can make a paste look bold or oddly sized.
  function toHtml(data, terms, labels, opts) {
    const lines = render(data, terms, labels, opts).split("\n");
    let html = "";
    let inList = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    const emph = (t) => (t.length > 1 && t[0] === "_" && t[t.length - 1] === "_" ? `<i>${inlineSemantic(t.slice(1, -1))}</i>` : inlineSemantic(t));
    for (const line of lines) {
      if (!line.trim()) { closeList(); continue; }
      if (line.startsWith("## ")) { closeList(); html += `<h2>${inlineSemantic(line.slice(3))}</h2>`; }
      else if (line.startsWith("# ")) { closeList(); html += `<h1>${inlineSemantic(line.slice(2))}</h1>`; }
      else if (line.startsWith("> ")) { closeList(); html += `<blockquote>${inlineSemantic(line.slice(2))}</blockquote>`; }
      else if (line.startsWith("- ")) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${emph(line.slice(2))}</li>`;
      } else { closeList(); html += `<p>${emph(line)}</p>`; }
    }
    closeList();
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  }

  // Plain text for targets that take no formatting (Notepad, .txt): no markup characters at all.
  function plainInline(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\" && i + 1 < s.length) { out += s[++i]; continue; }
      if (c === "*") { if (s[i + 1] === "*") i++; continue; }
      if (c === "[" && s[i + 1] === "↗" && s[i + 2] === "]" && s[i + 3] === "(") {
        const j = s.indexOf(")", i + 4);
        if (j > 0) { out += s.slice(i + 4, j); i = j; continue; }
      }
      if (c === "`") {
        const j = s.indexOf("`", i + 1);
        if (j > i) { out += s.slice(i + 1, j); i = j; continue; }
      }
      if (c === "<") {
        const j = s.indexOf(">", i + 1);
        if (j > i) { out += s.slice(i + 1, j); i = j; continue; }
      }
      out += c;
    }
    return out;
  }

  function toPlain(data, terms, labels, opts) {
    const unitalic = (t) => (t.length > 1 && t[0] === "_" && t[t.length - 1] === "_" ? t.slice(1, -1) : t);
    const out = [];
    for (const line of render(data, terms, labels, opts).split("\n")) {
      if (!line.trim()) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
      if (line.startsWith("## ")) out.push("", plainInline(line.slice(3)));
      else if (line.startsWith("# ")) out.push(plainInline(line.slice(2)));
      else if (line.startsWith("> ")) out.push(plainInline(line.slice(2)));
      else if (line.startsWith("- ")) out.push("• " + plainInline(unitalic(line.slice(2))));
      else out.push(plainInline(unitalic(line)));
    }
    return out.join("\n").trim() + "\n";
  }


  window.__huemarkExport = { collect, collectFrame, toMarkdown, toCitations, toResearch, toResume, toHtml, toPlain };
})();
