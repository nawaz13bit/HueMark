(() => {
  if (window.__huemarkContentLoaded) return; // avoid double listeners if injected twice
  window.__huemarkContentLoaded = true;

  const { highlight, highlightNodes, clearHighlights, HUEMARK_CLASS } = window.__huemark;

  let currentTerms = [];
  let currentOptions = { enabled: true, wholeWord: false };
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

  function rebuildMatchGroups() {
    const marks = document.querySelectorAll(`.${HUEMARK_CLASS}`);
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

  function applyState() {
    clearHighlights(document.body);
    currentMarkEl = null; // old <mark> elements are gone, nothing to un-mark
    if (currentOptions.enabled) runFullHighlight();
    rebuildMatchGroups();
    syncBarWords();
    lastAppliedTermsJSON = JSON.stringify(currentTerms);
    lastAppliedOptionsJSON = JSON.stringify(currentOptions);
  }

  // The <mark> currently scrolled-to via jump(), kept visually distinct from
  // the rest of the term's matches until the next jump (or a rehighlight).
  let currentMarkEl = null;

  function markCurrent(el) {
    if (currentMarkEl && currentMarkEl !== el && currentMarkEl.isConnected) {
      currentMarkEl.style.outline = "";
      currentMarkEl.style.outlineOffset = "";
    }
    currentMarkEl = el;
    if (!el) return;
    el.style.outline = "2px solid #1a73e8";
    el.style.outlineOffset = "1px";
  }

  // While a jump()'s smooth-scroll animation is still in flight, the match it
  // scrolled *from* (and sometimes others) transiently clip the scroll
  // observer's center band and fire its callback, which would stomp the index
  // jump() just set back to whatever happened to be crossing center at that
  // instant - producing a bounce between two matches on repeated presses.
  // Suppress the observer's index sync for the animation's duration.
  let suppressScrollSyncHandle = null;

  function jump(termLower, direction) {
    // Always rebuild from the live DOM first - matchGroups/currentIndex are
    // only otherwise refreshed by getCounts, so a jump right after a DOM
    // mutation or unrelated storage write could see a stale (even empty) map.
    rebuildMatchGroups();
    const arr = matchGroups.get(termLower) || [];
    if (arr.length === 0) return { count: 0, current: 0 };
    let idx = currentIndex.has(termLower) ? currentIndex.get(termLower) : -1;
    idx = direction === "next" ? (idx + 1) % arr.length : (idx - 1 + arr.length) % arr.length;
    currentIndex.set(termLower, idx);
    const el = arr[idx];
    clearTimeout(suppressScrollSyncHandle);
    suppressScrollSyncHandle = setTimeout(() => { suppressScrollSyncHandle = null; }, 700);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    markCurrent(el);
    return { count: arr.length, current: idx + 1 };
  }

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
    }
  }

  function startObserving() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      if (!currentOptions.enabled || currentTerms.length === 0) return;
      queueMutations(mutations);
      clearTimeout(debounceHandle);
      debounceHandle = setTimeout(runIncrementalHighlight, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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

    nav.append(barUpBtn, barDownBtn, barCountEl, moveBtn, closeBtn);
    bar.append(combo, nav);
    barShadow.append(style, bar);
    document.documentElement.appendChild(barHost);
    applyBarPosition();
  }

  function doJump(direction) {
    const entry = activeEntry();
    const term = entry?.term.trim();
    if (!term) return;
    const res = jump(term.toLowerCase(), direction);
    updateNavDisplay(res);
    setupScrollObserver();
  }

  function updateNavDisplay(res) {
    const entry = activeEntry();
    let count = 0;
    let current = 0;
    if (entry && entry.term.trim()) {
      if (res) {
        ({ count, current } = res);
      } else {
        const key = entry.term.trim().toLowerCase();
        const arr = matchGroups.get(key) || [];
        const idx = currentIndex.get(key);
        count = arr.length;
        current = idx !== undefined && idx >= 0 ? idx + 1 : 0;
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
    observedTerm = term || null;
    observedEls = arr;
    if (!term || arr.length === 0) return;

    scrollObserver = new IntersectionObserver(
      (entries) => {
        if (suppressScrollSyncHandle) return; // a jump()'s scroll animation is still in flight
        const hit = entries.find((e) => e.isIntersecting);
        if (!hit) return;
        const idx = arr.indexOf(hit.target);
        if (idx === -1) return;
        currentIndex.set(term, idx);
        updateNavDisplay();
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    arr.forEach((el) => scrollObserver.observe(el));
  }

  function loadStateAndRun() {
    chrome.storage.local.get(
      ["huemark_terms", "huemark_options", "huemark_bar_position"],
      (data) => {
        currentTerms = data.huemark_terms || [];
        currentOptions = { enabled: true, wholeWord: false, ...(data.huemark_options || {}) };
        if (BAR_CORNERS.includes(data.huemark_bar_position)) barPosition = data.huemark_bar_position;
        applyState();
      }
    );
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
      const nextOptions = { enabled: true, wholeWord: false, ...(changes.huemark_options.newValue || {}) };
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
      const result = {};
      for (const term of msg.terms || []) {
        const key = term.toLowerCase();
        const arr = matchGroups.get(key) || [];
        const idx = currentIndex.get(key);
        result[term] = { count: arr.length, current: idx !== undefined && idx >= 0 ? idx + 1 : 0 };
      }
      sendResponse(result);
      return;
    }
    if (msg?.type === "huemark:jump") {
      sendResponse(jump(msg.term.toLowerCase(), msg.direction));
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
