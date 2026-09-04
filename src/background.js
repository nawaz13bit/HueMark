chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["huemark_terms", "huemark_options"]);
  if (!existing.huemark_terms) {
    await chrome.storage.local.set({
      huemark_terms: [],
      huemark_options: { enabled: true, wholeWord: false }
    });
  }
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
    removeRuleIds: [PDF_REDIRECT_RULE_ID],
    addRules: [
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
});

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
      files: ["src/highlighter.js", "src/content.js"],
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
