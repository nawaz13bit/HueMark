// HueMark PDF viewer helper (loaded by vendor/pdfjs/web/viewer.html).
//
// Legacy ?pick=<id> flow: fetch bytes stashed by background.js and load
// them straight into PDF.js. The viewer's own toolbar is left untouched.
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
    // PDFViewerApplication.run() actually starts, so poll for it.
    const waitForApp = setInterval(() => {
      const promise = window.PDFViewerApplication?.initializedPromise;
      if (!promise) return;
      clearInterval(waitForApp);
      promise.then(openWithData);
    }, 20);
  });
})();
