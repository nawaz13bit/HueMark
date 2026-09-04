function applyI18n() {
  // @@bidi_dir is a predefined chrome.i18n message ("ltr"/"rtl") driven by
  // the active locale, so Arabic/Hebrew/etc. get a mirrored layout without
  // hardcoding a language list here - the popup's CSS is plain flexbox with
  // no hardcoded left/right, so setting dir is all that's needed.
  document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (!msg) return;
    const attr = el.dataset.i18nAttr;
    if (attr) el.setAttribute(attr, msg);
    else el.textContent = msg;
  });
}
applyI18n();

const termBoxes = document.getElementById("termBoxes");
const enabledToggle = document.getElementById("enabledToggle");
const wholeWordToggle = document.getElementById("wholeWordToggle");
const colorblindToggle = document.getElementById("colorblindToggle");
const clearAllBtn = document.getElementById("clearAllBtn");

const STANDARD_PALETTE = ["#ffeb3b", "#8bc34a", "#4fc3f7", "#f48fb1", "#ffab40", "#ce93d8"];
// Okabe-Ito colorblind-safe set - stays distinguishable under deuteranopia,
// protanopia, and tritanopia, unlike the standard palette's yellow/green
// and orange/pink pairs.
const COLORBLIND_PALETTE = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#D55E00", "#CC79A7"];

let terms = []; // { term, color }
let options = { enabled: true, wholeWord: false, colorblind: false };
let saveHandle = null;

function activePalette() {
  return options.colorblind ? COLORBLIND_PALETTE : STANDARD_PALETTE;
}

function nextColor() {
  return activePalette()[terms.length];
}

async function loadState() {
  const data = await chrome.storage.local.get(["huemark_terms", "huemark_options"]);
  terms = (data.huemark_terms || []).map((t) => ({ ...t }));
  options = { enabled: true, wholeWord: false, colorblind: false, ...(data.huemark_options || {}) };
}

function ensureTrailingEmptyBox() {
  const last = terms[terms.length - 1];
  if ((!last || last.term.trim().length > 0) && terms.length < activePalette().length) {
    terms.push({ term: "", color: nextColor() });
  }
}

// Remaps every term's color to the same slot in the newly-active palette, so
// switching palettes recolors existing terms instead of leaving them on
// colors from the palette that's no longer selected.
function remapColorsToActivePalette() {
  const standardIdx = new Map(STANDARD_PALETTE.map((c, i) => [c, i]));
  const colorblindIdx = new Map(COLORBLIND_PALETTE.map((c, i) => [c, i]));
  const palette = activePalette();
  terms.forEach((t) => {
    const idx = standardIdx.has(t.color) ? standardIdx.get(t.color) : colorblindIdx.get(t.color);
    if (idx !== undefined) t.color = palette[idx];
  });
}

function saveTermsNow() {
  chrome.storage.local.set({ huemark_terms: terms.filter((t) => t.term.trim().length > 0) });
  scheduleCountRefresh();
}

function saveTermsDebounced() {
  clearTimeout(saveHandle);
  saveHandle = setTimeout(saveTermsNow, 250);
}

async function saveOptions() {
  await chrome.storage.local.set({ huemark_options: options });
  scheduleCountRefresh();
}

async function getActiveTab() {
  // currentWindow can resolve to this popup's own pseudo-window on Firefox
  // instead of the browser window it's anchored over, which silently breaks
  // tab lookup (empty result) - lastFocusedWindow targets the real browser
  // window on both Chromium and Firefox.
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

function trySendMessage(tabId, message) {
  return new Promise((resolve) => {
    // frameId: 0 = top-level document only. content.js also runs inside
    // every ad/tracking iframe on the page (manifest has all_frames: true),
    // and an unaddressed sendMessage races all of them for the one reply
    // the callback gets - an iframe with zero matches could "win" and make
    // counts/jumps look broken even though the main-page highlights are fine.
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
      if (chrome.runtime.lastError) return resolve(undefined); // no listener yet
      resolve(response ?? null);
    });
  });
}

// Tabs that were already open before the extension was installed/reloaded
// never got the content script auto-injected by the manifest, so the first
// sendMessage to them fails with "Receiving end does not exist" and counts
// silently stay at 0/0. Inject it on demand and retry once.
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] }, // only the top-level frame - see trySendMessage
      files: ["src/highlighter.js", "src/content.js"],
    });
    return true;
  } catch {
    return false; // restricted page (chrome://, Web Store, etc.) - nothing we can do
  }
}

function sendToActiveTab(message) {
  return new Promise(async (resolve) => {
    const tab = await getActiveTab();
    if (!tab?.id) return resolve(null);
    let response = await trySendMessage(tab.id, message);
    if (response === undefined) {
      const injected = await injectContentScript(tab.id);
      if (!injected) return resolve(null);
      response = await trySendMessage(tab.id, message);
    }
    resolve(response ?? null);
  });
}

let countRefreshHandle = null;
function scheduleCountRefresh(delay = 150) {
  clearTimeout(countRefreshHandle);
  countRefreshHandle = setTimeout(refreshCounts, delay);
}

async function refreshCounts() {
  const names = terms.map((t) => t.term.trim()).filter(Boolean);
  if (names.length === 0) return;
  const result = await sendToActiveTab({ type: "huemark:getCounts", terms: names });
  if (!result) return;
  termBoxes.querySelectorAll(".term-box").forEach((box) => {
    const term = box.dataset.term;
    if (!term) return;
    const info = result[term];
    if (!info) return;
    updateCountUi(box, info.current, info.count);
  });
}

function updateCountUi(box, current, count) {
  const label = box.querySelector(".match-count");
  const upBtn = box.querySelector(".nav-up");
  const downBtn = box.querySelector(".nav-down");
  if (label) label.textContent = `${current}/${count}`;
  const disabled = count === 0;
  if (upBtn) upBtn.disabled = disabled;
  if (downBtn) downBtn.disabled = disabled;
}

function insertBoxAfter(entry) {
  const idx = terms.indexOf(entry);
  const newEntry = { term: "", color: nextColor() };
  terms.splice(idx + 1, 0, newEntry);
  render();
  focusBoxFor(newEntry);
  // render() rebuilds every box from scratch (counts reset to 0/0) - re-pull
  // the real counts for the terms that already existed, since none of them
  // changed, storage.set was never called for this action.
  scheduleCountRefresh();
}

function clearAll() {
  terms = [];
  ensureTrailingEmptyBox();
  render();
  saveTermsNow();
}

function focusBoxFor(entry) {
  const box = [...termBoxes.querySelectorAll(".term-box")].find((b) => b._entry === entry);
  box?.querySelector("input[type=text]")?.focus();
}

function removeBox(entry) {
  const idx = terms.indexOf(entry);
  if (idx === -1) return;
  terms.splice(idx, 1);
  ensureTrailingEmptyBox();
  render();
  saveTermsNow();
}

function makeBox(entry) {
  const box = document.createElement("div");
  box.className = "term-box";
  box._entry = entry;

  const canAddFrom = (e) =>
    e.term.trim().length > 0 &&
    terms.indexOf(e) === terms.length - 1 &&
    terms.length < activePalette().length;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "circle-btn add-btn";
  addBtn.textContent = "+";
  addBtn.title = chrome.i18n.getMessage("termAddAnother");
  addBtn.disabled = !canAddFrom(entry);
  addBtn.addEventListener("click", () => {
    if (!canAddFrom(entry)) return;
    insertBoxAfter(entry);
  });

  const textWrap = document.createElement("div");
  textWrap.className = "text-box";

  const text = document.createElement("input");
  text.type = "text";
  text.placeholder = chrome.i18n.getMessage("termPlaceholder");
  text.value = entry.term || "";
  text.addEventListener("input", () => {
    entry.term = text.value;
    box.dataset.term = text.value.trim();
    minusBtn.disabled = text.value.trim().length === 0;
    addBtn.disabled = !canAddFrom(entry);
    markDuplicates();
    saveTermsDebounced();
  });
  text.addEventListener("blur", () => {
    if (!text.value.trim() && terms.length > 1 && terms.indexOf(entry) !== terms.length - 1) {
      removeBox(entry);
    } else if (!text.value.trim() && terms.indexOf(entry) === terms.length - 1) {
      // trailing empty slot: nothing to clean up
    }
  });
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (canAddFrom(entry)) insertBoxAfter(entry);
    } else if (e.key === "Backspace" && !text.value && terms.length > 1) {
      e.preventDefault();
      removeBox(entry);
    }
  });

  textWrap.append(text);

  const navWrap = document.createElement("div");
  navWrap.className = "nav-box";

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "circle-btn nav-up";
  upBtn.textContent = "▲";
  upBtn.title = chrome.i18n.getMessage("termPreviousMatch");
  upBtn.disabled = true;
  upBtn.addEventListener("click", async () => {
    const term = entry.term.trim();
    if (!term) return;
    const res = await sendToActiveTab({ type: "huemark:jump", term, direction: "prev" });
    if (res) updateCountUi(box, res.current, res.count);
  });

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "circle-btn nav-down";
  downBtn.textContent = "▼";
  downBtn.title = chrome.i18n.getMessage("termNextMatch");
  downBtn.disabled = true;
  downBtn.addEventListener("click", async () => {
    const term = entry.term.trim();
    if (!term) return;
    const res = await sendToActiveTab({ type: "huemark:jump", term, direction: "next" });
    if (res) updateCountUi(box, res.current, res.count);
  });

  const count = document.createElement("span");
  count.className = "match-count";
  count.textContent = "0/0";

  navWrap.append(upBtn, downBtn, count);

  const colorWrap = document.createElement("div");
  colorWrap.className = "color-box";

  const swatchBtn = document.createElement("button");
  swatchBtn.type = "button";
  swatchBtn.className = "color-swatch-btn";
  swatchBtn.style.backgroundColor = entry.color || nextColor();
  swatchBtn.title = chrome.i18n.getMessage("termHighlightColor");
  swatchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openColorPopover(swatchBtn, (picked) => {
      entry.color = picked;
      swatchBtn.style.backgroundColor = picked;
      saveTermsNow();
    });
  });

  colorWrap.append(swatchBtn);

  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.className = "circle-btn remove-btn";
  minusBtn.textContent = "−";
  minusBtn.title = chrome.i18n.getMessage("termRemove");
  minusBtn.disabled = (entry.term || "").trim().length === 0;
  minusBtn.addEventListener("click", () => removeBox(entry));

  box.dataset.term = (entry.term || "").trim();
  box.append(addBtn, textWrap, navWrap, colorWrap, minusBtn);
  return box;
}

// A native <input type="color"> opens the OS color picker, which is a
// separate window. Firefox (unlike Chrome) closes extension popups the
// instant they lose focus to any external window, so that native picker
// closes the whole popup before a color can be picked. This in-DOM swatch
// popover never leaves the popup, so nothing ever steals focus.
let colorPopoverEl = null;
let colorPopoverCloseHandler = null;

function closeColorPopover() {
  if (colorPopoverEl) {
    colorPopoverEl.remove();
    colorPopoverEl = null;
  }
  if (colorPopoverCloseHandler) {
    document.removeEventListener("pointerdown", colorPopoverCloseHandler, true);
    colorPopoverCloseHandler = null;
  }
}

function openColorPopover(anchorBtn, onPick) {
  closeColorPopover();

  const panel = document.createElement("div");
  panel.className = "color-popover";
  activePalette().forEach((c) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "color-popover-swatch";
    sw.style.backgroundColor = c;
    sw.title = c;
    sw.addEventListener("click", () => {
      onPick(c);
      closeColorPopover();
    });
    panel.appendChild(sw);
  });

  // Appended to <body> (not inside #termBoxes) and positioned fixed, so the
  // scroll container's overflow can't clip it - see #termBoxes CSS.
  document.body.appendChild(panel);
  colorPopoverEl = panel;

  const anchorRect = anchorBtn.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const viewportW = document.documentElement.clientWidth;
  const viewportH = document.documentElement.clientHeight;

  let left = anchorRect.right - panelRect.width;
  left = Math.max(4, Math.min(left, viewportW - panelRect.width - 4));
  let top = anchorRect.bottom + 4;
  if (top + panelRect.height > viewportH - 4) {
    top = anchorRect.top - panelRect.height - 4; // no room below - flip up
  }
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  colorPopoverCloseHandler = (e) => {
    if (panel.contains(e.target) || anchorBtn.contains(e.target)) return;
    closeColorPopover();
  };
  document.addEventListener("pointerdown", colorPopoverCloseHandler, true);
}

function render() {
  termBoxes.innerHTML = "";
  terms.forEach((entry) => termBoxes.appendChild(makeBox(entry)));
  enabledToggle.checked = options.enabled;
  wholeWordToggle.checked = options.wholeWord;
  colorblindToggle.checked = options.colorblind;
  markDuplicates();
}

// Two terms that differ only by case highlight the exact same page text, so
// only one of their colors can ever actually render - the highlighter keys
// each <mark> by its matched text, not by which term produced it (see
// content.js's matchGroups). That used to fail silently; flag it instead.
function findDuplicateKeys() {
  const seen = new Map();
  for (const t of terms) {
    const key = t.term.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return new Set([...seen].filter(([, count]) => count > 1).map(([key]) => key));
}

function markDuplicates() {
  const dupKeys = findDuplicateKeys();
  termBoxes.querySelectorAll(".term-box").forEach((box) => {
    const key = (box.dataset.term || "").toLowerCase();
    const isDup = key.length > 0 && dupKeys.has(key);
    box.classList.toggle("duplicate", isDup);
    box.title = isDup ? chrome.i18n.getMessage("termDuplicateWarning") : "";
  });
}

enabledToggle.addEventListener("change", () => {
  options.enabled = enabledToggle.checked;
  saveOptions();
});

wholeWordToggle.addEventListener("change", () => {
  options.wholeWord = wholeWordToggle.checked;
  saveOptions();
});

colorblindToggle.addEventListener("change", () => {
  options.colorblind = colorblindToggle.checked;
  remapColorsToActivePalette();
  render();
  saveOptions();
  saveTermsNow();
});

clearAllBtn.addEventListener("click", clearAll);

// Opens HueMark's PDF.js viewer with no file loaded, so the user can pick a
// local PDF via PDF.js's own built-in "Open File" toolbar option. That path
// reads the file as a File object directly (no fetch, no file:// origin
// involved), so it works even on Firefox, which blocks extension pages from
// fetching file:// URLs outright (unlike Chrome/Edge, where the automatic
// file:// redirect in background.js already handles this).
// Browsing must happen in the popup's own document - only a real click here
// carries the "user activation" browsers require to show a file picker, so
// this can't be done from the freshly-opened viewer tab without a second
// manual click there. The picked file's bytes are handed to background.js,
// which stashes them briefly so the new viewer tab can pull them back out
// (a blob: URL created here would be revoked the instant this popup closes,
// which happens as soon as focus moves to the new tab).
const localPdfInput = document.getElementById("localPdfInput");
// Firefox tears down the browserAction popup document the instant a native
// <input type=file> dialog steals focus, killing this script before the user
// can pick anything (no console error - the page is just gone). So on
// Firefox, skip our own picker and open the bare viewer tab instead, where
// the user can use PDF.js's own built-in Open File option (see comment above).
const isFirefox = /firefox/i.test(navigator.userAgent);
document.getElementById("openLocalPdfBtn").addEventListener("click", () => {
  if (isFirefox) {
    chrome.tabs.create({ url: chrome.runtime.getURL("vendor/pdfjs/web/viewer.html") });
    return;
  }
  localPdfInput.click();
});
localPdfInput.addEventListener("change", async () => {
  const file = localPdfInput.files[0];
  localPdfInput.value = "";
  if (!file) return;
  // chrome.runtime.sendMessage JSON-serializes its payload, and
  // JSON.stringify(arrayBuffer) yields "{}" (ArrayBuffers have no enumerable
  // properties) - silently dropping the bytes. Base64 survives JSON fine.
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",", 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const { id } = await chrome.runtime.sendMessage({ type: "huemark:stashLocalPdf", base64, name: file.name });
  const viewerUrl = chrome.runtime.getURL("vendor/pdfjs/web/viewer.html");
  chrome.tabs.create({ url: `${viewerUrl}?pick=${id}` });
});

// Tells content.js's floating bar to hide while this popup is open. The
// port disconnects automatically when the popup window closes - that's the
// reliable "popup just closed" signal (no unload/beforeunload needed).
async function connectPopupPort() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    chrome.tabs.connect(tab.id, { name: "huemark-popup", frameId: 0 });
  } catch {
    // restricted page or no content script listening - nothing to do
  }
}

// chrome.action.openPopup() can open this window (Chromium always; Firefox
// 149+ too), but there's no matching close API on either browser, so the
// toggle shortcut asks us to close ourselves instead.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "huemark:closePopup") window.close();
});

(async () => {
  await loadState();
  ensureTrailingEmptyBox();
  render();
  scheduleCountRefresh();
  connectPopupPort();
  // donate.js is untracked (see .gitignore) and controls when the donate
  // link is shown; the popup works fine without it, link just stays hidden.
  if (typeof updateDonateLinkVisibility === "function") await updateDonateLinkVisibility();
})();
