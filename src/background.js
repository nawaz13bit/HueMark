chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["huemark_terms", "huemark_options"]);
  if (!existing.huemark_terms) {
    await chrome.storage.local.set({
      huemark_terms: [],
      huemark_options: { enabled: true, wholeWord: false }
    });
  }
});

// Right-click "add selection to HueMark". Mirrors popup.js's palettes and
// 6-term cap; the new term gets the first palette color no term uses yet.
const CONTEXT_MENU_ID = "huemark-add-selection";
const MAX_TERMS = 6;
const MAX_SELECTION_LENGTH = 200;
const STANDARD_PALETTE = ["#ffeb3b", "#8bc34a", "#4fc3f7", "#f48fb1", "#ffab40", "#ce93d8"];
const COLORBLIND_PALETTE = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#D55E00", "#CC79A7"];

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: chrome.i18n.getMessage("contextMenuAdd"),
      contexts: ["selection"]
    });
  });
}

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

// Terms treat * ? \ and a /.../ wrapper as syntax, so a selection containing
// them must be escaped to stay the literal text the user selected.
function selectionToTerm(raw) {
  const text = raw.trim().replace(/\s+/g, " ").slice(0, MAX_SELECTION_LENGTH).trim();
  if (!text) return "";
  return text.replace(/[\\*?]/g, "\\$&").replace(/^\/(.+)\/$/, "\\/$1\\/");
}

let badgeHandle = null;
function flashBadge(text) {
  chrome.action.setBadgeText({ text });
  clearTimeout(badgeHandle);
  badgeHandle = setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}

// A running or finished export outlives the popup that started it: the popup
// reads this on open and offers the copy (a clipboard write needs a click).
// Session storage keeps the match text off disk where the browser has it.
const EXPORT_KEY = "huemark_export";
const exportStore = chrome.storage.session || chrome.storage.local;
function setExportBadge(text, color) {
  clearTimeout(badgeHandle);
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const stored = (await exportStore.get(EXPORT_KEY))[EXPORT_KEY];
  if (stored?.state === "running" && stored.tabId === tabId) {
    exportStore.remove(EXPORT_KEY);
    chrome.action.setBadgeText({ text: "" });
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return;
  const term = selectionToTerm(info.selectionText);
  if (!term) return;

  const data = await chrome.storage.local.get(["huemark_terms", "huemark_options"]);
  const terms = data.huemark_terms || [];
  const filled = terms.filter((t) => t.term && t.term.trim());
  if (filled.some((t) => t.term.trim().toLowerCase() === term.toLowerCase())) return; // already highlighted
  if (filled.length >= MAX_TERMS) {
    flashBadge("!");
    return;
  }

  const palette = data.huemark_options?.colorblind ? COLORBLIND_PALETTE : STANDARD_PALETTE;
  const used = new Set(filled.map((t) => t.color.toLowerCase()));
  const color = palette.find((c) => !used.has(c.toLowerCase())) || palette[filled.length % palette.length];
  await chrome.storage.local.set({ huemark_terms: [...filled, { term, color }] });
});

// Redirect top-level navigation to a .pdf URL into HueMark's own bundled
// PDF.js viewer instead of the browser's built-in one, so highlighter.js/
// content.js can run against a real text layer we control. The browser's
// native viewer lives at an origin no third-party extension can inject
// into, so redirecting to an extension-owned viewer page is the only
// architecture that works (same approach pdf.js's own Chrome extension
// uses). The extension id isn't known until runtime (no "key" pinned in
// manifest.json), so the rule is registered dynamically rather than
// shipped as a static declarative_net_request ruleset. Firefox supports
// the same regexSubstitution dynamic-rule redirect syntax as Chrome, so
// this runs on both.
const PDF_REDIRECT_RULE_ID = 1;
// arXiv serves PDFs at /pdf/<id> with no .pdf suffix, which the generic rule can't see.
const ARXIV_PDF_RULE_ID = 2;

async function setupPdfRedirect() {
  const viewerUrl = chrome.runtime.getURL("vendor/pdfjs/web/viewer.html");
  try {
    await registerPdfRedirectRule(viewerUrl);
  } catch (err) {
    // Chrome rejects a bad regexSubstitution/condition at registration time -
    // surface it instead of letting the redirect silently never happen.
    console.error("HueMark: failed to register PDF redirect rule", err);
  }
}

async function registerPdfRedirectRule(viewerUrl) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [PDF_REDIRECT_RULE_ID, ARXIV_PDF_RULE_ID],
    addRules: [
      {
        id: ARXIV_PDF_RULE_ID,
        priority: 1,
        action: { type: "redirect", redirect: { regexSubstitution: `${viewerUrl}?file=\\0` } },
        condition: {
          // new-style (2101.00001, 2101.00001v2) and old-style (hep-th/9901001) ids
          regexFilter: "^https://(www\\.)?arxiv\\.org/pdf/[A-Za-z.\\-]*/?[0-9]{4,7}(\\.[0-9]{4,5})?(v[0-9]+)?(\\?[^#]*)?(#.*)?$",
          resourceTypes: ["main_frame"]
        }
      },
      {
        id: PDF_REDIRECT_RULE_ID,
        priority: 1,
        action: {
          type: "redirect",
          // \0 = the entire matched (original) URL, per DNR's regexSubstitution
          // syntax - not URL-encoded, so a PDF URL containing its own "&" or
          // "#" in the query string can confuse the viewer's ?file= parsing.
          // Same known limitation as pdf.js's own extension; not worth a
          // background round-trip through tabs.update just to encodeURIComponent it.
          redirect: { regexSubstitution: `${viewerUrl}?file=\\0` }
        },
        condition: {
          // file:// is deliberately excluded here - declarativeNetRequest has
          // a known bug/limitation where redirect rules don't fire for
          // file:// requests (they have no "origin" for DNR's matcher), even
          // with "Allow access to file URLs" granted. Local PDFs are handled
          // separately below via chrome.tabs.onUpdated + chrome.tabs.update,
          // which works because it operates on the tab, not the request.
          regexFilter: "^https?://.*\\.pdf(\\?[^#]*)?(#.*)?$",
          resourceTypes: ["main_frame"]
        }
      }
    ]
  });
}

chrome.runtime.onInstalled.addListener(setupPdfRedirect);
chrome.runtime.onStartup.addListener(setupPdfRedirect);
// Also re-register whenever the worker spins up (idempotent: remove + add). An unpacked
// reload, a cleared rule store or a missed onInstalled would otherwise leave PDFs opening
// in the browser's own viewer until the next browser restart.
setupPdfRedirect();

// declarativeNetRequest can't redirect file:// navigations (see comment
// above), so local PDFs are caught here instead: watch for a tab finishing
// navigation to a local .pdf, then redirect it with the tabs API. Only fires
// once "Allow access to file URLs" is granted for HueMark, since that's what
// lets tab.url actually be populated with a file:// value at all.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!url || !/^file:\/\/.*\.pdf(\?.*)?$/i.test(url)) return;
  const viewerUrl = chrome.runtime.getURL("vendor/pdfjs/web/viewer.html");
  chrome.tabs.update(tabId, { url: `${viewerUrl}?file=${encodeURIComponent(url)}` });
});

// Hands a locally-picked PDF's bytes from the popup (see popup.js) to the
// viewer tab it opens right after. In-memory only, one-shot, short-lived -
// this is just a relay between two extension pages that can't otherwise
// share the file directly, not real storage.
const pendingLocalPdfs = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "huemark:stashLocalPdf") {
    const id = crypto.randomUUID();
    pendingLocalPdfs.set(id, { base64: message.base64, name: message.name });
    setTimeout(() => pendingLocalPdfs.delete(id), 60000);
    sendResponse({ id });
    return;
  }
  if (message?.type === "huemark:fetchPickedPdf") {
    const entry = pendingLocalPdfs.get(message.id);
    pendingLocalPdfs.delete(message.id);
    sendResponse(entry || null);
    return;
  }
  if (message?.type === "huemark:exportBegin" && sender.tab && sender.frameId === 0) {
    exportStore.set({ [EXPORT_KEY]: { state: "running", tabId: sender.tab.id } });
    setExportBadge("…", "#888888");
    return;
  }
  if (message?.type === "huemark:exportDone" && sender.tab && sender.frameId === 0) {
    const data = message.data;
    const total = data ? data.rows.length + (data.frames || []).reduce((n, f) => n + f.rows.length, 0) : 0;
    const state = !data ? "failed" : total === 0 && !data.scanned ? "none" : "ready";
    exportStore.set({ [EXPORT_KEY]: { state, tabId: sender.tab.id, data: state === "ready" ? data : null, names: message.names || [] } });
    setExportBadge(state === "ready" ? "✓" : "!", state === "ready" ? "#2e7d32" : "#c62828");
    return;
  }
  if (message?.type === "huemark:exportClear") {
    exportStore.remove(EXPORT_KEY);
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  if (sender.tab && typeof message?.type === "string" && message.type.startsWith("huemark:frame")) {
    handleFrameRelay(message, sender.tab.id).then(sendResponse);
    return true;
  }
  if (message?.type === "huemark:subChanged" && sender.tab) {
    // An iframe's match count changed: let the top frame refresh its totals.
    chrome.tabs.sendMessage(sender.tab.id, { type: "huemark:subChanged" }, { frameId: 0 },
      () => void chrome.runtime.lastError);
    return;
  }
});

// The top frame's view of the page's iframes. Frames can't message each other,
// so content.js asks here and these run the matching window.__huemarkApi
// method inside the iframes (same isolated world as the content scripts).
const FRAME_API_METHODS = new Set(["counts", "focus", "clearCurrent", "export"]);

async function runInFrames(tabId, target, method, args) {
  if (!FRAME_API_METHODS.has(method)) return [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, ...target },
      func: (m, a) => {
        const api = window.__huemarkApi;
        return api && typeof api[m] === "function" ? api[m](...a) : null;
      },
      args: [method, args],
    });
    return results
      .filter((r) => r.frameId !== 0 && r.result != null)
      .map((r) => ({ frameId: r.frameId, result: r.result }));
  } catch {
    return []; // tab navigated away or a frame is not scriptable
  }
}

async function handleFrameRelay(message, tabId) {
  const all = { allFrames: true };
  if (message.type === "huemark:frameCounts") {
    const keys = Array.isArray(message.keys) ? message.keys.filter((k) => typeof k === "string") : [];
    return runInFrames(tabId, all, "counts", [keys]);
  }
  if (message.type === "huemark:frameClear") {
    return runInFrames(tabId, all, "clearCurrent", []);
  }
  if (message.type === "huemark:frameExport") {
    return runInFrames(tabId, all, "export", []);
  }
  if (message.type === "huemark:frameFocus") {
    if (typeof message.key !== "string" || !Number.isInteger(message.idx) || !Number.isInteger(message.frameId)) return [];
    await runInFrames(tabId, all, "clearCurrent", []);
    return runInFrames(tabId, { frameIds: [message.frameId] }, "focus", [message.key, message.idx]);
  }
  return [];
}

// frameId: 0 - only the top-level frame runs the bar/nav state content.js
// tracks; see the matching comment in popup.js's trySendMessage.
const COMMAND_MESSAGES = {
  "huemark-cycle-word": { type: "huemark:cycleWord", direction: "next" },
  "huemark-jump-prev": { type: "huemark:jumpActive", direction: "prev" },
  "huemark-jump-next": { type: "huemark:jumpActive", direction: "next" }
};

function trySendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
      if (chrome.runtime.lastError) return resolve(undefined); // no content script on this tab
      resolve(response ?? null);
    });
  });
}

// Tabs that were already open before the extension was installed/reloaded
// never got the content script auto-injected by the manifest, so the first
// sendMessage to them fails with "Receiving end does not exist" - same issue
// popup.js's injectContentScript works around; commands need the same fix.
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ["src/highlighter.js", "src/exporter.js", "src/content.js"],
    });
    return true;
  } catch {
    return false; // restricted page (chrome://, about:, Web Store, etc.)
  }
}

async function sendToTab(tabId, message) {
  let response = await trySendToTab(tabId, message);
  if (response === undefined) {
    const injected = await injectContentScript(tabId);
    if (!injected) return null;
    response = await trySendToTab(tabId, message);
  }
  return response ?? null;
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "huemark-toggle-fc") {
    // Derive the current step from real state rather than tracking our own
    // counter - the popup or bar can close by other means (the bar's own X
    // button, clicking away from the popup) and a stored counter would drift.
    const state = await sendToTab(tab.id, { type: "huemark:getToggleState" });
    if (!state) {
      console.warn("HueMark: huemark-toggle-fc got no toggle state from content script");
      return;
    }
    if (state.popupOpen) {
      // No API closes the action popup from here - ask the popup script,
      // which is still alive while its window is open, to close itself.
      chrome.runtime.sendMessage({ type: "huemark:closePopup" }, () => {
        void chrome.runtime.lastError; // popup already closed - ignore
      });
    } else if (state.barVisible) {
      await sendToTab(tab.id, { type: "huemark:hideBar" });
      // Firefox 149+ supports action.openPopup() from a background script
      // without requiring a user gesture (older Firefox lacked this
      // entirely, which is why this used to be Chromium-only). Call it
      // unconditionally and log failures instead of silently no-op'ing, so
      // a regression on some Firefox version shows up in the background
      // console instead of just quietly skipping the popup step.
      try {
        await chrome.action.openPopup();
      } catch (err) {
        console.warn("HueMark: chrome.action.openPopup() failed", err);
      }
    } else {
      sendToTab(tab.id, { type: "huemark:showBar" });
    }
    return;
  }

  const message = COMMAND_MESSAGES[command];
  if (!message) return;
  sendToTab(tab.id, message);
});
