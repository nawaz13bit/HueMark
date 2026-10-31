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
  const AUX = 'nav, aside, footer, [role="navigation"], [role="complementary"], [role="doc-bibliography"], [role="doc-endnotes"], .references, #references, .reflist, .refbegin, .navbox, .vertical-navbox, .sidebar, .citation, .mw-references-wrap, .toc, #toc, .mw-editsection, .hatnote, #similar, #citedby-articles, #citedby, .similar-articles, .related-articles, .bibliography';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Cut `context` characters either side of [start, end), on word boundaries.
  function snippet(full, start, end) {
    let a = Math.max(0, start - CONTEXT_CHARS);
    let b = Math.min(full.length, end + CONTEXT_CHARS);
    if (a > 0) { const sp = full.indexOf(" ", a); if (sp !== -1 && sp < start) a = sp + 1; }
    if (b < full.length) { const sp = full.lastIndexOf(" ", b); if (sp > end) b = sp; }
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
      else if (prevEl && n.parentElement !== prevEl && raw && !/\s$/.test(raw) && /^[^\s]/.test(n.nodeValue)) {
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
  function collapse(raw) {
    const map = new Array(raw.length + 1);
    let text = "";
    let lastSpace = true; // drops leading whitespace
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (/\s/.test(ch)) {
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
      if (host.closest(AUX) || AUX_HEADING.test(row.heading) || isLabelOrLinkList(host, block, model.text)) row.aux = 1;
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

  // PDF.js only builds text layers for pages near the viewport, so step
  // through every page, then put the user back where they were.
  async function renderAllPdfPages() {
    const app = window.PDFViewerApplication;
    const total = app.pagesCount || 0;
    const container = document.getElementById("viewerContainer");
    const origPage = app.page;
    const origTop = container ? container.scrollTop : 0;
    for (let p = 1; p <= total; p++) {
      if (pageRendered(p)) continue;
      app.page = p;
      for (let waited = 0; waited < 3000 && !pageRendered(p); waited += 50) await sleep(50);
      await sleep(80);
    }
    app.page = origPage;
    if (container) container.scrollTop = origTop;
    await sleep(700); // let the highlighter's observer mark the new text layers
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

  function collectPdf(marks, blocks) {
    const rows = [];
    // Headings carry across pages; scanning pages that hold no match is only done for short documents.
    const scanAll = (window.PDFViewerApplication.pagesCount || 0) <= 12;
    let curHeading = "";
    for (const page of document.querySelectorAll("#viewer .page")) {
      const pageNo = Number(page.dataset.pageNumber);
      const layer = page.querySelector(".textLayer");
      const pageMarks = layer ? marks.filter((m) => layer.contains(m.node || m)) : [];
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
          pm = { start, end, ...collapse(flat.slice(start, end)) };
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
        const pm = lineAt[o[0]] ? paraModel(paraOf[lineAt[o[0]] - 1]) : null;
        if (pm) {
          const cut = (i) => pm.map[Math.min(Math.max(i - pm.start, 0), pm.map.length - 1)];
          const bs = cut(o[0]);
          Object.assign(row, blockRef(blocks, pm, bs, Math.max(bs + 1, cut(Math.min(o[1], pm.end)))));
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
      journal: one("citation_journal_title", "prism.publicationName"),
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
    return {
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
    const rows = pdf ? collectPdf(marks, blocks) : collectWeb(marks, blocks);
    // Highlights exist but none could be located: the text layers have no layout (hidden tab). Say so, not "no matches".
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
    return { rows: collectWeb(window.__huemark.queryMarks(), blocks), blocks, url: location.href, title: document.title || "" };
  }

  const clean = (s) => s.replace(NOISE, " ").replace(UNREADABLE, "?").replace(/\s+/g, " ");
  const esc = (s) => s.replace(/([\\`*_{}\[\]<>|])/g, "\\$1");

  // ---- sentences and paragraphs ---------------------------------------------
  // [start, end) of every sentence in `text`, trimmed; memoised per text.
  const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|Fig|Eq|e\.g|i\.e|cf)\.\s*$/;
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
      if (prev && ABBREV.test(text.slice(prev[0], prev[1]))) prev[1] = e;
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
    md += `- **${labels.source}:** <${data.url}>\n`;
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
        md += `- ${it.loc ? `*${it.loc}* — ` : ""}${it.text}${it.frame ? ` (<${it.frame}>)` : ""}\n`;
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
  const CITE_STYLES = ["apa", "mla", "chicago", "harvard", "ieee", "vancouver", "ama", "bluebook", "plain"];
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

  function normalizeMeta(data, now) {
    const raw = data.meta || {};
    const url = data.srcUrl || data.url || "";
    // A scholarly/OpenGraph title is clean; document.title usually has " - Site" on the end.
    const title = (clean(raw.title || "").trim() || clean(data.title || "").trim().replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, ""))
      .replace(/\s+[|–—-]\s+Wikipedia$/i, "");
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}
    const pages = raw.firstPage ? (raw.lastPage && raw.lastPage !== raw.firstPage ? `${raw.firstPage}–${raw.lastPage}` : raw.firstPage) : "";
    const doiMatch = /10\.\d{4,9}\/\S+/.exec(raw.doi || "");
    return {
      authors: parseAuthors(raw.authors), title: title || host || url,
      date: parseDate(raw.date), site: clean(raw.site || raw.publisher || "").trim() || (data.isPdf ? "" : host),
      journal: clean(raw.journal || "").trim(), volume: raw.volume || "", issue: raw.issue || "", pages,
      doi: doiMatch ? doiMatch[0] : "", url, isPdf: !!data.isPdf, now,
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
    if (style === "bluebook") return p ? `(at ${p})` : "";
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
        return `1. ${authors}${e(ends(t))} ${style === "ama" ? `*${e(dot(m.journal))}*` : e(dot(m.journal))} ${vol}.${m.doi ? ` doi:${e(m.doi)}` : ""}`.replace(/\s+/g, " ");
      }
      if (style === "ama") {
        const pub = d ? ` Published ${d.m ? MONTHS[d.m - 1] + " " : ""}${d.d ? d.d + ", " : ""}${d.y}.` : "";
        return `1. ${authors}${e(ends(t))}${site ? ` ${e(dot(site))}` : ""}${pub} Accessed ${MONTHS[acc.getMonth()]} ${acc.getDate()}, ${acc.getFullYear()}. <${m.url}>`.replace(/\s+/g, " ");
      }
      const pub = d ? `${d.y}${d.m ? " " + M_3[d.m - 1] : ""}${d.d ? " " + d.d : ""}` : "";
      return `1. ${authors}${e(t)} [Internet]. ${site ? e(site) + (pub ? "; " : "") : ""}${e(pub)} [cited ${acc.getFullYear()} ${M_3[acc.getMonth()]} ${acc.getDate()}]. Available from: <${m.url}>`.replace(/\s+/g, " ");
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
      quotes.push({ text, cutL, cutR, page: r.page || 0 });
    }
    const unreadable = quotes.filter((q) => hasUnreadable.test(q.text)).length;

    let md = `# ${labels.citeTitle || "Citations"}: ${esc(clean(m.title).trim())}\n`;
    if (data.scanned) md += `\n> ${labels.scanned}\n`;
    if (unreadable) md += `\n> ${labels.unreadable.replace("{n}", String(unreadable))}\n`;
    md += `\n## ${labels.citeQuotes || "Quotes"} (${quotes.length})\n\n`;
    if (!quotes.length) md += `_${labels.none}_\n`;
    for (const q of quotes.slice(0, MAX_PER_TERM)) {
      const mk = marker(style, m, q.page);
      md += `- “${q.cutL ? "[…] " : ""}${esc(q.text)}${q.cutR ? " […]" : ""}”${mk ? " " + esc(mk) : ""}\n`;
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
    if (opts.preset === "citation") return toCitations(data, terms, labels, opts);
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
