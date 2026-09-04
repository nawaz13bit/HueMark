// HueMark: when the viewer is opened right after the popup's "Open local
// PDF..." picker (?pick=<id> in the URL), fetch the stashed file bytes from
// background.js and load them straight into PDF.js - the user already
// browsed and picked the file in the popup, so no second file dialog here.
(function () {
  const id = new URLSearchParams(location.search).get("pick");
  if (!id) return;

  chrome.runtime.sendMessage({ type: "huemark:fetchPickedPdf", id }).then((entry) => {
    if (!entry?.base64) return;
    const bytes = Uint8Array.from(atob(entry.base64), (c) => c.charCodeAt(0));
    const openWithData = () => {
      window.PDFViewerApplication.open({ data: bytes, filename: entry.name });
    };
    // window.PDFViewerApplication.initializedPromise isn't set until
    // PDFViewerApplication.run() actually starts (a beat after this script
    // runs and after "webviewerloaded" fires), so poll for it rather than
    // assuming either event has already happened.
    const waitForApp = setInterval(() => {
      const promise = window.PDFViewerApplication?.initializedPromise;
      if (!promise) return;
      clearInterval(waitForApp);
      promise.then(openWithData);
    }, 20);
  });
})();
