(() => {
  if (window.__huemarkContentLoaded) return; // avoid double listeners if injected twice
  window.__huemarkContentLoaded = true;

  const { highlight, highlightNodes, clearHighlights, queryMarks, onShadowRoot } = window.__huemark;

  // The top frame owns the bar, the popup/shortcut conversation and the
  // cross-frame totals. Iframes (manifest has all_frames) only highlight their
  // own document and answer the top frame through the background script.
  const isTop = window === window.top;

  let currentTerms = [];
  // Per-tab switch, answered by the background (every tab starts off). enabled is always derived from it.
  let tabOn = false;
  let currentOptions = { enabled: false, wholeWord: false };
  let powerBtn = null;
  const isPdfViewer = location.href.startsWith(chrome.runtime.getURL("vendor/pdfjs/web/viewer.html"));
  function refreshPowerBtn() {
    if (!powerBtn) return;
    const key = tabOn ? (isPdfViewer ? "barDisablePdf" : "barDisable") : (isPdfViewer ? "barEnablePdf" : "barEnable");
    powerBtn.title = chrome.i18n.getMessage(key);
    powerBtn.style.opacity = tabOn ? "" : "0.55";
  }
  let observer = null;
  let debounceHandle = null;

  // term (lowercase) -> array of <mark> elements, in DOM order
  let matchGroups = new Map();
  // term (lowercase) -> index into matchGroups[term] currently scrolled to, -1 = none yet
  let currentIndex = new Map();

  function runFullHighlight() {
    if (!currentOptions.enabled || currentTerms.length === 0) return;
    highlight(document.body, currentTerms, currentOptions);
  }

  // Iframe side: tell the top frame (via the background) when this frame's
  // number of matches changed, so its totals can be refreshed.
  let lastReportedTotal = 0;
  let reportHandle = null;

  function reportMatchTotal(total) {
    if (isTop || total === lastReportedTotal) return;
    lastReportedTotal = total;
    clearTimeout(reportHandle);
    reportHandle = setTimeout(() => {
      try {
        chrome.runtime.sendMessage({ type: "huemark:subChanged" }, () => void chrome.runtime.lastError);
      } catch { /* extension reloaded under us - nothing to tell */ }
    }, 300);
  }

  function rebuildMatchGroups() {
    const marks = queryMarks();
    reportMatchTotal(marks.length);
    const groups = new Map();
    marks.forEach((mark) => {
      const key = mark.getAttribute("data-huemark-term");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mark);
    });
    const nextIndex = new Map();
    for (const [key, arr] of groups) {
      const prev = currentIndex.has(key) ? currentIndex.get(key) : -1;
      nextIndex.set(key, prev < arr.length ? prev : -1);
    }
    matchGroups = groups;
    currentIndex = nextIndex;
  }

  // Snapshot of the terms/options actually reflected in the current DOM
  // highlights, as of the last applyState() run - distinct from currentTerms,
  // which the bar's live-typing UI mutates in place ahead of the debounced
  // storage write that eventually echoes back through onChanged.
  let lastAppliedTermsJSON = null;
  let lastAppliedOptionsJSON = null;

  // A cross-origin iframe's script can run its first scan before the frame has
  // any layout (body.checkVisibility() === false), so every text node is skipped
  // as hidden and no DOM mutation follows when the parent later sizes the frame.
  // Remember that the scan happened in that state and redo it once it's visible.
  const bodyVisible = () =>
    !document.body || !document.body.checkVisibility ||
    document.body.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  let scannedWhileHidden = false;
  function rescanIfNowVisible() {
    if (scannedWhileHidden && bodyVisible()) applyState();
  }

  function applyState() {
    clearHighlights(document.body);
    currentMarkEl = null; // old <mark> elements are gone, nothing to un-mark
    scannedWhileHidden = !!currentOptions.enabled && !bodyVisible();
    if (currentOptions.enabled) runFullHighlight();
    rebuildMatchGroups();
    syncBarWords();
    scheduleMarkers();
    scheduleSubRefresh();
    lastAppliedTermsJSON = JSON.stringify(currentTerms);
    lastAppliedOptionsJSON = JSON.stringify(currentOptions);
  }

  // The <mark> currently scrolled-to via jump(), kept visually distinct from
  // the rest of the term's matches until the next jump (or a rehighlight).
  let currentMarkEl = null;

  // Range matches (CSS Highlight engine) can't take an outline; they paint a
  // thick underline through setCurrent() instead.
  function markCurrent(el) {
    if (currentMarkEl && currentMarkEl !== el) {
      if (currentMarkEl.setCurrent) currentMarkEl.setCurrent(false);
      else if (currentMarkEl.isConnected) {
        currentMarkEl.style.outline = "";
        currentMarkEl.style.outlineOffset = "";
      }
    }
    currentMarkEl = el;
    if (!el) return;
    if (el.setCurrent) { el.setCurrent(true); return; }
    el.style.outline = "2px solid #1a73e8";
    el.style.outlineOffset = "1px";
  }

  // ---- engine selection: <mark> by default, CSS Custom Highlight fallback ----
  // Some frameworks re-render over our <mark>s and remove them. When the page
  // removes marks repeatedly, Ranges (which add no DOM nodes) survive.
  const REMOVAL_LIMIT = 5;
  const REMOVAL_WINDOW_MS = 10000;
  let pageRemovals = [];

  function switchEngine(name) {
    if (window.__huemark.getEngine() === name) return;
    if (!window.__huemark.setEngine(name)) return;
    currentMarkEl = null;
    applyState();
  }

  function noteForeignRemovals(mutations) {
    if (window.__huemark.getEngine() !== "mark" || !window.__huemark.cssSupported) return;
    const now = Date.now();
    for (const m of mutations) {
      if (m.type !== "childList") continue;
      for (const n of m.removedNodes) {
        if (n.nodeType !== Node.ELEMENT_NODE || window.__huemark.wasRemovedByUs(n)) continue;
        const hadMark = n.classList.contains(window.__huemark.HUEMARK_CLASS) ||
          n.getElementsByClassName(window.__huemark.HUEMARK_CLASS).length > 0;
        if (hadMark) pageRemovals.push(now);
      }
    }
    pageRemovals = pageRemovals.filter((t) => now - t <= REMOVAL_WINDOW_MS);
    // Framework-managed pages get a lower bar before we give up on <mark>s.
    if (pageRemovals.length >= (pageLooksFrameworkManaged() ? 2 : REMOVAL_LIMIT)) {
      pageRemovals = [];
      setTimeout(() => switchEngine("css"), 0);
    }
  }

  // Attribute hints of client-rendered frameworks that tend to wipe foreign DOM.
  const FRAMEWORK_HINTS = "#__next, #__nuxt, [data-reactroot], [data-v-app], [ng-version], [data-server-rendered]";
  function pageLooksFrameworkManaged() {
    try { return !!document.querySelector(FRAMEWORK_HINTS); } catch { return false; }
  }

  // While a jump()'s smooth-scroll animation is still in flight, the match it
  // scrolled *from* (and sometimes others) transiently clip the scroll
  // observer's center band and fire its callback, which would stomp the index
  // jump() just set back to whatever happened to be crossing center at that
  // instant - producing a bounce between two matches on repeated presses.
  // Suppress the observer's index sync for the animation's duration.
  let suppressScrollSyncHandle = null;

  function suppressScrollSync() {
    clearTimeout(suppressScrollSyncHandle);
    suppressScrollSyncHandle = setTimeout(() => { suppressScrollSyncHandle = null; }, 700);
  }

  // Scrolls to and outlines this frame's idx-th match of a term.
  function focusLocal(termLower, idx) {
    const el = (matchGroups.get(termLower) || [])[idx];
    if (!el) return;
    subCursor.delete(termLower);
    currentIndex.set(termLower, idx);
    suppressScrollSync();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    markCurrent(el);
  }

  function jump(termLower, direction) {
    // Always rebuild from the live DOM first - matchGroups/currentIndex are
    // only otherwise refreshed by getCounts, so a jump right after a DOM
    // mutation or unrelated storage write could see a stale (even empty) map.
    rebuildMatchGroups();
    const arr = matchGroups.get(termLower) || [];
    if (arr.length === 0) return { count: 0, current: 0 };
    let idx = currentIndex.has(termLower) ? currentIndex.get(termLower) : -1;
    idx = direction === "next" ? (idx + 1) % arr.length : (idx <= 0 ? arr.length - 1 : idx - 1);
    focusLocal(termLower, idx);
    return { count: arr.length, current: idx + 1 };
  }

  // ---------------------------------------------------------------------
  // Iframes. The top frame adds its iframes' matches to its own: counts and
  // next/prev run through the whole page, this frame's matches first, then
  // each iframe's (in frame order). The iframes are reached through the
  // background script (scripting.executeScript into every frame), because
  // frames can't message each other directly.
  // ---------------------------------------------------------------------

  // term key -> [{ frameId, n }] for iframes that have matches, by frameId
  let subCounts = new Map();
  // term key -> { frameId, idx }: the current match is in an iframe
  const subCursor = new Map();
  let subRefreshHandle = null;

  const hasChildFrames = () => isTop && window.length > 0;

  function relay(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          void chrome.runtime.lastError;
          resolve(response ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function termKeys() {
    return [...new Set(currentTerms.map((t) => (t.term || "").trim().toLowerCase()).filter(Boolean))];
  }

  async function refreshSubCounts() {
    if (!isTop) return;
    const keys = termKeys();
    const next = new Map();
    if (hasChildFrames() && keys.length > 0 && currentOptions.enabled) {
      for (const { frameId, result } of (await relay({ type: "huemark:frameCounts", keys })) || []) {
        for (const [key, n] of Object.entries(result)) {
          if (n > 0) next.set(key, [...(next.get(key) || []), { frameId, n }]);
        }
      }
      for (const list of next.values()) list.sort((a, b) => a.frameId - b.frameId);
    }
    subCounts = next;
    for (const [key, cur] of subCursor) {
      const f = next.get(key)?.find((x) => x.frameId === cur.frameId);
      if (!f || cur.idx >= f.n) subCursor.delete(key);
    }
    if (barCountEl) updateNavDisplay();
  }

  function scheduleSubRefresh() {
    if (!hasChildFrames() && subCounts.size === 0) return;
    clearTimeout(subRefreshHandle);
    subRefreshHandle = setTimeout(refreshSubCounts, 300);
  }

  // { count, current } for a term across this frame and its iframes.
  function countsFor(key) {
    const local = (matchGroups.get(key) || []).length;
    const subs = subCounts.get(key) || [];
    const count = subs.reduce((sum, f) => sum + f.n, local);
    let current = 0;
    const cur = subCursor.get(key);
    if (cur) {
      let before = local;
      for (const f of subs) {
        if (f.frameId === cur.frameId) { current = before + cur.idx + 1; break; }
        before += f.n;
      }
    } else {
      const idx = currentIndex.get(key);
      current = idx !== undefined && idx >= 0 ? idx + 1 : 0;
    }
    return { count, current };
  }

  async function jumpAcross(key, direction) {
    if (!hasChildFrames()) return jump(key, direction);
    await refreshSubCounts();
    const subs = subCounts.get(key) || [];
    if (subs.length === 0) return jump(key, direction);

    rebuildMatchGroups();
    const frames = [{ frameId: 0, n: (matchGroups.get(key) || []).length }, ...subs].filter((f) => f.n > 0);
    const total = frames.reduce((sum, f) => sum + f.n, 0);
    let pos = countsFor(key).current - 1; // -1: nothing visited yet
    pos = direction === "next" ? (pos + 1) % total : (pos <= 0 ? total - 1 : pos - 1);

    for (const f of frames) {
      if (pos >= f.n) { pos -= f.n; continue; }
      if (f.frameId === 0) {
        focusLocal(key, pos);
        relay({ type: "huemark:frameClear" });
      } else {
        markCurrent(null);
        subCursor.set(key, { frameId: f.frameId, idx: pos });
        suppressScrollSync();
        await relay({ type: "huemark:frameFocus", key, idx: pos, frameId: f.frameId });
      }
      break;
    }
    return countsFor(key);
  }

  // What the background script runs inside each iframe (see background.js).
  window.__huemarkApi = {
    counts(keys) {
      rebuildMatchGroups();
      return Object.fromEntries(keys.map((k) => [k, (matchGroups.get(k) || []).length]));
    },
    focus(key, idx) {
      rebuildMatchGroups();
      focusLocal(key, idx);
      return true;
    },
    clearCurrent() {
      markCurrent(null);
      return true;
    },
    export() {
      return window.__huemarkExport ? window.__huemarkExport.collectFrame() : null;
    }
  };

  // Mutation batches accumulate here across possibly-several MutationObserver
  // callback firings before the debounce timer flushes them, so nothing
  // queued in an earlier firing is lost when a later one resets the timer.
  let pendingRoots = new Set();
  let pendingTextNodes = new Set();
  let pendingRemoval = false;

  function queueMutations(mutations) {
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            pendingRoots.add(n);
          } else if (n.nodeType === Node.TEXT_NODE) {
            pendingTextNodes.add(n);
          }
        });
        if (m.removedNodes.length > 0) pendingRemoval = true;
      } else if (m.type === "characterData") {
        pendingTextNodes.add(m.target);
      } else if (m.type === "attributes") {
        // A class/style/hidden toggle can be a container that was skipped as
        // hidden at scan time (a lazy-rendered section, an accordion panel,
        // content-visibility:auto) becoming visible with no childList or
        // characterData change to trigger a rescan on its own. Only queue it
        // when it now looks visible, so unrelated attribute churn (hover/
        // active state classes etc.) on already-visible or still-hidden
        // elements doesn't force a subtree walk for nothing.
        const el = m.target;
        const visibleNow = typeof el.checkVisibility === "function"
          ? el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })
          : true;
        if (visibleNow) pendingRoots.add(el);
      }
    }
  }

  // Rescans only what actually changed since the last flush - not the whole
  // document.body - so cost tracks the size of what was added/edited rather
  // than the size of the whole page (which only grows on infinite-scroll
  // pages, making a full-body rescan on every batch progressively slower).
  function runIncrementalHighlight() {
    const roots = pendingRoots;
    const textNodes = pendingTextNodes;
    const removalHappened = pendingRemoval;
    pendingRoots = new Set();
    pendingTextNodes = new Set();
    pendingRemoval = false;

    if (!currentOptions.enabled || currentTerms.length === 0) return;

    let newMarks = 0;
    const liveRoots = [...roots].filter((r) => r.isConnected);
    // Skip roots nested inside another pending root so the same subtree
    // isn't walked twice in one flush.
    const outerRoots = liveRoots.filter((r) => !liveRoots.some((other) => other !== r && other.contains(r)));
    for (const root of outerRoots) {
      newMarks += highlight(root, currentTerms, currentOptions);
    }

    const standaloneTextNodes = [...textNodes].filter(
      (n) => n.isConnected && !outerRoots.some((r) => r.contains(n))
    );
    if (standaloneTextNodes.length > 0) {
      newMarks += highlightNodes(standaloneTextNodes, currentTerms, currentOptions);
    }

    // matchGroups only needs rebuilding when the set of <mark>s could have
    // actually changed - new ones were just added, or mutation records
    // reported removals (which may have taken existing marks with them).
    if (newMarks > 0 || removalHappened) {
      rebuildMatchGroups();
      syncBarWords();
      scheduleMarkers();
      scheduleSubRefresh();
    }
  }

  // ---------------------------------------------------------------------
  // Scrollbar markers: a thin strip along the right edge with one tick per
  // match, colored per term, positioned as the match's fraction of the whole
  // scrollable height. Click a tick to jump to that match. Lives in its own
  // shadow root on <html> (outside <body>, so the MutationObserver above
  // never sees it). In PDF.js the scroller is #viewerContainer, and pages
  // render lazily, so only already-rendered pages get ticks.
  // ---------------------------------------------------------------------

  const MAX_TICKS = 2000;
  let markerHost = null;
  let markerLayer = null;
  let markerHandle = null;

  function ensureMarkers() {
    if (markerHost) return;
    markerHost = document.createElement("div");
    markerHost.id = "huemark-markers-host";
    markerHost.style.cssText = "all:initial; position:fixed; top:0; right:0; bottom:0; width:10px; z-index:2147483646; pointer-events:none;";
    const shadow = markerHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .tick {
        position: absolute;
        right: 0;
        width: 10px;
        height: 4px;
        box-sizing: border-box;
        border: 1px solid rgba(0,0,0,0.45);
        cursor: pointer;
        pointer-events: auto;
      }
      .tick:hover { width: 14px; }
    `;
    markerLayer = document.createElement("div");
    shadow.append(style, markerLayer);
    document.documentElement.appendChild(markerHost);
  }

  function scheduleMarkers() {
    if (!isTop) return; // iframes get no tick strip
    clearTimeout(markerHandle);
    markerHandle = setTimeout(renderMarkers, 200);
  }

  function renderMarkers() {
    markerHandle = null;
    const marks = (currentOptions.enabled && currentTerms.length > 0)
      ? queryMarks()
      : [];
    if (marks.length === 0) {
      if (markerHost) markerHost.style.display = "none";
      return;
    }
    ensureMarkers();
    markerHost.style.display = "block";

    const container = document.getElementById("viewerContainer");
    const scroller = container || document.scrollingElement || document.documentElement;
    const scrollTop = scroller.scrollTop;
    const scrollHeight = scroller.scrollHeight;
    const viewHeight = container ? container.clientHeight : window.innerHeight;
    const viewTop = container ? container.getBoundingClientRect().top : 0;
    if (scrollHeight <= 0 || viewHeight <= 0) return;

    const frag = document.createDocumentFragment();
    const seen = new Set();
    for (const mark of marks) {
      const rect = mark.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // Position within the scroller's full content height; marks inside an
      // inner scroll container fall outside 0..1 and are skipped.
      const docY = rect.top - viewTop + scrollTop;
      const frac = docY / scrollHeight;
      if (frac < 0 || frac > 1) continue;
      const y = Math.round(viewTop + frac * viewHeight);
      const color = mark.style.backgroundColor;
      const dedupe = `${y}|${color}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.top = `${y}px`;
      tick.style.background = color;
      tick.addEventListener("click", () => {
        if (!mark.isConnected) return;
        const key = mark.getAttribute("data-huemark-term");
        rebuildMatchGroups();
        const idx = (matchGroups.get(key) || []).indexOf(mark);
        if (idx !== -1) currentIndex.set(key, idx);
        subCursor.delete(key);
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        markCurrent(mark);
        updateNavDisplay();
      });
      frag.appendChild(tick);
      if (seen.size >= MAX_TICKS) break;
    }
    markerLayer.replaceChildren(frag);
  }

  window.addEventListener("resize", () => { rescanIfNowVisible(); scheduleMarkers(); });
  // Page height changes (images loading, content expanding) shift every
  // match's fraction without any mutation we'd otherwise react to.
  new ResizeObserver(() => { rescanIfNowVisible(); scheduleMarkers(); }).observe(document.documentElement);

  const OBS_OPTS = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden", "aria-hidden", "open"]
  };

  function startObserving() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      if (!currentOptions.enabled || currentTerms.length === 0) return;
      noteForeignRemovals(mutations);
      queueMutations(mutations);
      clearTimeout(debounceHandle);
      debounceHandle = setTimeout(runIncrementalHighlight, 150);
    });
    observer.observe(document.body, OBS_OPTS);
    // Shadow trees aren't covered by a subtree observation of the body, so
    // each one (existing now, or attached later) gets its own observe().
    onShadowRoot((sr) => { if (observer) observer.observe(sr, OBS_OPTS); });
  }

  // ---------------------------------------------------------------------
  // Floating bar: one row, two columns (words | nav). Lets you rename an
  // existing term and scroll through its matches without opening the popup.
  // No color picker or add/remove here - that stays popup-only. Lives in a
  // shadow root so the host page's CSS can't bleed in or get bled on.
  // ---------------------------------------------------------------------

  let barHost = null;
  let barShadow = null;
  let barDropdownEl = null;
  let barEditInput = null;
  let barCountEl = null;
  let barUpBtn = null;
  let barDownBtn = null;
  let barSaveHandle = null;
  let activeIndex = 0; // index into currentTerms of the word nav/scroll-tracking applies to
  let scrollObserver = null;
  let popupOpen = false; // bar stays hidden while the popup window covers the page
  let barClosed = true; // bar starts hidden - only the huemark-toggle-fc shortcut (Alt+Shift+Right / Cmd+Shift+Right, or the X button) shows/hides it

  const BAR_CORNERS = ["bottom-right", "bottom-left", "top-left", "top-right"];
  let barPosition = "bottom-right";

  function applyBarPosition() {
    if (!barHost) return;
    const [v, h] = barPosition.split("-");
    // PDF.js's own toolbar sits fixed across the top of the viewer page - a
    // "top" bar position would render underneath/behind it there. Offset
    // below the toolbar's real height instead of a fixed guess, since that
    // height isn't the same across PDF.js versions/zoom levels.
    const pdfToolbar = document.getElementById("toolbarContainer");
    const topOffset = pdfToolbar ? `${pdfToolbar.getBoundingClientRect().bottom + 8}px` : "16px";
    barHost.style.top = v === "top" ? topOffset : "";
    barHost.style.bottom = v === "bottom" ? "16px" : "";
    barHost.style.left = h === "left" ? "16px" : "";
    barHost.style.right = h === "right" ? "16px" : "";
    // Bar pinned to the bottom of the screen has no room to drop the list
    // downward without it running off-screen, so open it upward instead.
    if (barDropdownEl) barDropdownEl.classList.toggle("dropup", v === "bottom");
  }

  function cycleBarPosition() {
    const idx = BAR_CORNERS.indexOf(barPosition);
    barPosition = BAR_CORNERS[(idx + 1) % BAR_CORNERS.length];
    applyBarPosition();
    chrome.storage.local.set({ huemark_bar_position: barPosition });
  }

  function activeEntry() {
    return currentTerms[activeIndex] || null;
  }

  function ensureBar() {
    if (barHost) return;

    barHost = document.createElement("div");
    barHost.id = "huemark-float-bar-host";
    // `all: initial` must come first - it resets every longhand property on
    // this element, so anything meant to survive (position, z-index) has to
    // be declared after it or the reset wipes it back out.
    // Direction is an inherited CSS property, so setting it on the host
    // (rather than inside the shadow tree) still reaches every element in
    // barShadow, letting the logical properties below (inset-inline-*,
    // border-inline-*, margin-inline-*) auto-mirror for RTL locales.
    const dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";
    barHost.style.cssText = `all:initial; position:fixed; z-index:2147483647; direction:${dir};`;
    barShadow = barHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      .bar {
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 480px;
        padding: 6px 8px;
        border-radius: 18px;
        background: #222;
        color: #eee;
        font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      }
      .combo {
        position: relative;
        flex-shrink: 0;
      }
      .edit {
        width: 130px;
        border-radius: 12px;
        border: 2px solid var(--wc, #5b8def);
        background: #333;
        color: #eee;
        font: inherit;
        padding-block: 3px;
        padding-inline: 8px 22px;
        outline: none;
      }
      .toggle {
        position: absolute;
        top: 0;
        inset-inline-end: 0;
        width: 20px;
        height: 100%;
        border: none;
        background: none;
        color: #ccc;
        cursor: pointer;
        font-size: 9px;
      }
      .dropdown {
        display: none;
        position: absolute;
        top: calc(100% + 4px);
        inset-inline-start: 0;
        min-width: 100%;
        max-height: 160px;
        overflow-y: auto;
        background: #2a2a2a;
        border-radius: 10px;
        padding: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        z-index: 1;
      }
      .dropdown.open { display: block; }
      .dropdown.dropup {
        top: auto;
        bottom: calc(100% + 4px);
      }
      .word {
        padding: 4px 8px;
        border-radius: 6px;
        color: #ccc;
        cursor: pointer;
        white-space: nowrap;
      }
      .word:hover { background: #3a3a3a; }
      .word.active { color: #fff; font-weight: 600; }
      .word::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-inline-end: 6px;
        background: var(--wc, #5b8def);
      }
      .nav {
        display: flex;
        align-items: center;
        gap: 3px;
        flex-shrink: 0;
        border-inline-start: 1px solid #444;
        padding-inline-start: 8px;
      }
      .nav button {
        width: 20px;
        height: 20px;
        border: none;
        border-radius: 50%;
        background: #3a3a3a;
        color: #eee;
        cursor: pointer;
        font-size: 10px;
        line-height: 1;
      }
      .nav button:hover:not(:disabled) { background: #4a4a4a; }
      .nav button:disabled { opacity: 0.35; cursor: default; }
      .count {
        min-width: 30px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
    `;

    const bar = document.createElement("div");
    bar.className = "bar";

    const combo = document.createElement("div");
    combo.className = "combo";

    barEditInput = document.createElement("input");
    barEditInput.type = "text";
    barEditInput.className = "edit";
    barEditInput.addEventListener("input", () => {
      const entry = activeEntry();
      if (!entry) return;
      entry.term = barEditInput.value;
      const label = barDropdownEl.children[activeIndex];
      if (label) label.textContent = barEditInput.value || chrome.i18n.getMessage("termEmptyPlaceholder");
      debounceSaveBarEdit();
      updateNavDisplay();
    });
    barEditInput.addEventListener("focus", () => openDropdown());
    barEditInput.addEventListener("blur", () => {
      // Finalize: an entry left empty on blur (as opposed to just transiently
      // empty mid-retype - see debounceSaveBarEdit) is treated the same way
      // popup.js treats a blanked-out term box, and is dropped.
      const entry = activeEntry();
      if (!entry || entry.term.trim()) return;
      const idx = currentTerms.indexOf(entry);
      if (idx === -1) return;
      currentTerms.splice(idx, 1);
      clearTimeout(barSaveHandle);
      saveBarTermsNow();
      syncBarWords();
    });

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "toggle";
    toggleBtn.textContent = "▾";
    toggleBtn.title = chrome.i18n.getMessage("barChooseWord");
    toggleBtn.addEventListener("click", () => toggleDropdown());

    barDropdownEl = document.createElement("div");
    barDropdownEl.className = "dropdown";

    combo.append(barEditInput, toggleBtn, barDropdownEl);

    // composedPath (not e.target) is required to see inside the shadow root -
    // a click on a shadow-DOM element reports the shadow host as e.target.
    document.addEventListener("pointerdown", (e) => {
      if (!e.composedPath().includes(combo)) closeDropdown();
    });

    const nav = document.createElement("div");
    nav.className = "nav";

    barUpBtn = document.createElement("button");
    barUpBtn.type = "button";
    barUpBtn.textContent = "▲";
    barUpBtn.title = chrome.i18n.getMessage("barPreviousMatch");
    barUpBtn.addEventListener("click", () => doJump("prev"));

    barDownBtn = document.createElement("button");
    barDownBtn.type = "button";
    barDownBtn.textContent = "▼";
    barDownBtn.title = chrome.i18n.getMessage("barNextMatch");
    barDownBtn.addEventListener("click", () => doJump("next"));

    barCountEl = document.createElement("span");
    barCountEl.className = "count";
    barCountEl.textContent = "0/0";

    const moveBtn = document.createElement("button");
    moveBtn.type = "button";
    moveBtn.textContent = "⤡";
    moveBtn.title = chrome.i18n.getMessage("barMoveCorner");
    moveBtn.addEventListener("click", cycleBarPosition);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.title = chrome.i18n.getMessage("barClose");
    closeBtn.addEventListener("click", () => {
      barClosed = true;
      barHost.style.display = "none";
      closeDropdown();
    });

    // Power: switches HueMark on/off for this tab only (same switch as the popup's).
    powerBtn = document.createElement("button");
    powerBtn.type = "button";
    powerBtn.textContent = "⏻";
    powerBtn.addEventListener("click", () => {
      const turnOn = !tabOn;
      if (!turnOn) {
        barClosed = true;
        barHost.style.display = "none";
        closeDropdown();
      }
      try {
        chrome.runtime.sendMessage({ type: "huemark:setTabOn", on: turnOn }, () => void chrome.runtime.lastError);
      } catch (_) {}
    });
    refreshPowerBtn();

    nav.append(barUpBtn, barDownBtn, barCountEl, moveBtn, powerBtn, closeBtn);
    bar.append(combo, nav);
    barShadow.append(style, bar);
    document.documentElement.appendChild(barHost);
    applyBarPosition();
  }

  async function doJump(direction) {
    const entry = activeEntry();
    const term = entry?.term.trim();
    if (!term) return;
    const res = await jumpAcross(term.toLowerCase(), direction);
    updateNavDisplay(res);
    setupScrollObserver();
  }

  function updateNavDisplay(res) {
    if (!barCountEl) return;
    const entry = activeEntry();
    let count = 0;
    let current = 0;
    if (entry && entry.term.trim()) {
      if (res) {
        ({ count, current } = res);
      } else {
        ({ count, current } = countsFor(entry.term.trim().toLowerCase()));
      }
    }
    barCountEl.textContent = `${current}/${count}`;
    barUpBtn.disabled = count === 0;
    barDownBtn.disabled = count === 0;
  }

  function saveBarTermsNow() {
    chrome.storage.local.set({ huemark_terms: currentTerms });
  }

  // Deliberately does NOT filter out empty-term entries the way popup.js's
  // saveTermsNow does - the bar only ever renames an existing term, it never
  // holds a placeholder "trailing empty box". Filtering here on every
  // debounced keystroke used to mean pausing mid-retype (e.g. select-all,
  // about to type a new name) while the field was transiently empty would
  // persist the term as deleted, and the onChanged listener reindexing
  // currentTerms out from under the in-progress edit would then misdirect
  // further keystrokes onto a different term. Emptiness is only ever
  // finalized (and the entry actually dropped) on blur - see above.
  function debounceSaveBarEdit() {
    clearTimeout(barSaveHandle);
    barSaveHandle = setTimeout(saveBarTermsNow, 250);
  }

  function openDropdown() {
    barDropdownEl.classList.add("open");
  }

  function closeDropdown() {
    barDropdownEl.classList.remove("open");
  }

  function toggleDropdown() {
    barDropdownEl.classList.toggle("open");
  }

  function syncComboColor() {
    const entry = activeEntry();
    barEditInput.style.setProperty("--wc", entry?.color || "#5b8def");
  }

  function setActive(index) {
    activeIndex = index;
    [...barDropdownEl.children].forEach((child, i) => {
      child.classList.toggle("active", i === activeIndex);
    });
    const entry = activeEntry();
    if (barEditInput !== barShadow.activeElement) {
      barEditInput.value = entry?.term || "";
    }
    syncComboColor();
    closeDropdown();
    updateNavDisplay();
    setupScrollObserver();
  }

  function makeWordToken(entry, index) {
    const label = document.createElement("div");
    label.className = "word";
    label.style.setProperty("--wc", entry.color || "#5b8def");
    label.textContent = entry.term || chrome.i18n.getMessage("termEmptyPlaceholder");
    label.addEventListener("click", () => setActive(index));
    return label;
  }

  function syncBarWords() {
    if (!isTop) return; // the bar lives in the top frame only
    if (!barHost) ensureBar();

    if (currentTerms.length === 0 || popupOpen || barClosed) {
      barHost.style.display = "none";
      return;
    }
    barHost.style.display = "block";

    if (activeIndex >= currentTerms.length) activeIndex = 0;

    const sameLength = barDropdownEl.children.length === currentTerms.length;
    if (!sameLength) {
      barDropdownEl.innerHTML = "";
      currentTerms.forEach((entry, i) => barDropdownEl.appendChild(makeWordToken(entry, i)));
      [...barDropdownEl.children].forEach((child, i) => child.classList.toggle("active", i === activeIndex));
    } else {
      [...barDropdownEl.children].forEach((child, i) => {
        child.textContent = currentTerms[i].term || chrome.i18n.getMessage("termEmptyPlaceholder");
        child.style.setProperty("--wc", currentTerms[i].color || "#5b8def");
        child.classList.toggle("active", i === activeIndex);
      });
    }
    if (barEditInput !== barShadow.activeElement) {
      barEditInput.value = activeEntry()?.term || "";
    }
    syncComboColor();

    updateNavDisplay();
    setupScrollObserver();
  }

  // Elements currently under `scrollObserver`, so a rebuild can be skipped
  // when the active term's match set hasn't actually changed - matchGroups
  // gets a brand-new Map/array on every rebuild even when its contents are
  // identical, so this compares element-by-element rather than by reference.
  let observedTerm = null;
  let observedEls = [];
  let rangeScrollHandler = null;

  function sameEls(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Keeps the bar's counter in sync with manual scrolling, not just arrow
  // clicks - a mark crossing the vertical center band is treated as "current".
  function setupScrollObserver() {
    const entry = activeEntry();
    const term = entry?.term.trim().toLowerCase();
    const arr = term ? matchGroups.get(term) || [] : [];

    if (term === observedTerm && sameEls(arr, observedEls)) return; // nothing to redo

    if (scrollObserver) scrollObserver.disconnect();
    if (rangeScrollHandler) {
      window.removeEventListener("scroll", rangeScrollHandler, true);
      rangeScrollHandler = null;
    }
    observedTerm = term || null;
    observedEls = arr;
    if (!term || arr.length === 0) return;

    // IntersectionObserver can't watch Ranges: poll positions on scroll instead.
    if (arr[0].setCurrent) {
      let frame = 0;
      rangeScrollHandler = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (suppressScrollSyncHandle) return;
          const lo = window.innerHeight * 0.45;
          const hi = window.innerHeight * 0.55;
          const idx = arr.findIndex((m) => {
            if (!m.isConnected) return false;
            const r = m.getBoundingClientRect();
            return r.bottom >= lo && r.top <= hi;
          });
          if (idx === -1) return;
          currentIndex.set(term, idx);
          subCursor.delete(term);
          updateNavDisplay();
        });
      };
      window.addEventListener("scroll", rangeScrollHandler, { capture: true, passive: true });
      return;
    }

    scrollObserver = new IntersectionObserver(
      (entries) => {
        if (suppressScrollSyncHandle) return; // a jump()'s scroll animation is still in flight
        const hit = entries.find((e) => e.isIntersecting);
        if (!hit) return;
        const idx = arr.indexOf(hit.target);
        if (idx === -1) return;
        currentIndex.set(term, idx);
        subCursor.delete(term);
        updateNavDisplay();
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    arr.forEach((el) => scrollObserver.observe(el));
  }

  let exportRunning = false;

  function loadStateAndRun() {
    // Per-tab switch: every tab starts off; the background keeps the set of tabs turned on (session memory).
    let tabAnswered = false;
    let data = null;
    const go = () => {
      if (!tabAnswered || !data) return;
      currentTerms = data.huemark_terms || [];
      currentOptions = { wholeWord: false, ...(data.huemark_options || {}), enabled: tabOn };
      if (BAR_CORNERS.includes(data.huemark_bar_position)) barPosition = data.huemark_bar_position;
      applyState();
    };
    try {
      chrome.runtime.sendMessage({ type: "huemark:getTabOn" }, (r) => {
        void chrome.runtime.lastError;
        tabOn = !!r?.on;
        tabAnswered = true;
        go();
      });
    } catch (_) { tabAnswered = true; }
    chrome.storage.local.get(
      ["huemark_terms", "huemark_options", "huemark_bar_position"],
      (d) => { data = d || {}; go(); }
    );
  }

  function setTabOnLocal(on) {
    tabOn = !!on;
    currentOptions = { ...currentOptions, enabled: tabOn };
    applyState();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // Only huemark_terms/huemark_options changes need a full clear+rehighlight
    // (applyState) - a bar-position-only change (e.g. another frame/tab
    // clicking the move-corner button) has nothing to do with highlighted
    // content and shouldn't drop the current-match outline or pay for a
    // full-document rebuild.
    // Some browsers redeliver onChanged when a value is written back
    // unchanged (e.g. a duplicate storage.set, or a sync conflict resolving
    // to the same value). Comparing against what's actually reflected in the
    // DOM right now - not against currentTerms/currentOptions, which the
    // bar's live-typing UI mutates in place before its own debounced write
    // even lands - lets a truly no-op echo skip the full clear+rehighlight,
    // while a genuine rename (bar edit -> storage write -> this listener)
    // still refreshes normally since lastAppliedTermsJSON still reflects the
    // pre-edit DOM state at that point.
    let needsHighlightRefresh = false;
    if (changes.huemark_terms) {
      const nextTerms = changes.huemark_terms.newValue || [];
      if (JSON.stringify(nextTerms) !== lastAppliedTermsJSON) needsHighlightRefresh = true;
      currentTerms = nextTerms;
    }
    if (changes.huemark_options) {
      const nextOptions = { wholeWord: false, ...(changes.huemark_options.newValue || {}), enabled: tabOn };
      if (JSON.stringify(nextOptions) !== lastAppliedOptionsJSON) needsHighlightRefresh = true;
      currentOptions = nextOptions;
    }
    if (changes.huemark_bar_position && BAR_CORNERS.includes(changes.huemark_bar_position.newValue)) {
      barPosition = changes.huemark_bar_position.newValue;
      applyBarPosition();
    }
    if (needsHighlightRefresh) applyState();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "huemark:getCounts") {
      rebuildMatchGroups();
      const answer = () => {
        const result = {};
        for (const term of msg.terms || []) result[term] = countsFor(term.toLowerCase());
        sendResponse(result);
      };
      if (hasChildFrames()) refreshSubCounts().then(answer);
      else answer();
      return true;
    }
    if (msg?.type === "huemark:exportAlive") { sendResponse({ running: exportRunning }); return; }
    if (msg?.type === "huemark:tabOn") {
      if (!!msg.on !== tabOn) setTabOnLocal(msg.on);
      refreshPowerBtn();
      return;
    }
    if (msg?.type === "huemark:export") {
      if (!window.__huemarkExport) { sendResponse(null); return; }
      if (!tabOn) { sendResponse({ started: false, off: true }); return; }
      // Acknowledge at once and report through the background instead of the
      // response: the popup that asked may be closed long before a big PDF
      // finishes, and the background keeps the result until the popup returns.
      sendResponse({ started: true });
      if (exportRunning) return; // a second request while one is collecting would interleave PDF stepping
      exportRunning = true;
      const names = msg.names || [];
      const finish = (data) => {
        exportRunning = false;
        try { chrome.runtime.sendMessage({ type: "huemark:exportDone", data, names }, () => void chrome.runtime.lastError); } catch (_) {}
      };
      try { chrome.runtime.sendMessage({ type: "huemark:exportBegin" }, () => void chrome.runtime.lastError); } catch (_) {}
      (async () => {
        const data = await window.__huemarkExport.collect();
        data.frames = hasChildFrames()
          ? ((await relay({ type: "huemark:frameExport" })) || []).slice().sort((a, b) => a.frameId - b.frameId).map((f) => f.result).filter((r) => r && r.rows.length)
          : [];
        return data;
      })().then(finish, () => finish(null));
      return;
    }
    if (msg?.type === "huemark:jump") {
      jumpAcross(msg.term.toLowerCase(), msg.direction).then(sendResponse);
      return true;
    }
    if (msg?.type === "huemark:subChanged") {
      scheduleSubRefresh();
      return;
    }
    if (msg?.type === "huemark:cycleWord") {
      if (currentTerms.length === 0) return;
      const delta = msg.direction === "prev" ? -1 : 1;
      setActive((activeIndex + delta + currentTerms.length) % currentTerms.length);
    }
    if (msg?.type === "huemark:jumpActive") {
      doJump(msg.direction);
    }
    if (msg?.type === "huemark:getToggleState") {
      sendResponse({
        popupOpen,
        barVisible: !!barHost && !barClosed && barHost.style.display !== "none",
      });
      return;
    }
    if (msg?.type === "huemark:hideBar") {
      barClosed = true;
      if (barHost) barHost.style.display = "none";
      closeDropdown();
    }
    if (msg?.type === "huemark:showBar") {
      barClosed = false;
      syncBarWords();
    }
  });

  // The popup keeps this port open for as long as its window is on screen -
  // onDisconnect fires automatically when it closes, no manual signal needed.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "huemark-popup") return;
    popupOpen = true;
    // barClosed is left as-is here: it's now explicitly owned by the ✕
    // button and the huemark-toggle-fc shortcut's hideBar/showBar messages. If
    // opening the popup reset it, the toggle's "close popup -> hide
    // everything" step would immediately un-hide the bar the moment the
    // popup connects, before the user pressed the shortcut again.
    if (barHost) barHost.style.display = "none";
    port.onDisconnect.addListener(() => {
      popupOpen = false;
      // Closing the popup by any means (click-away, Esc, the shortcut's
      // explicit close step) should reveal the pill bar again - this is
      // also what lets Firefox users get the bar back after manually
      // opening the popup from the toolbar icon, since Firefox has no API
      // for background.js to open it programmatically (see background.js).
      barClosed = false;
      syncBarWords();
    });
  });

  if (document.body) {
    loadStateAndRun();
    startObserving();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      loadStateAndRun();
      startObserving();
    });
  }
})();
