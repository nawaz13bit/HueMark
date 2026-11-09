# HueMark Privacy Policy

_Last updated: 2026-11-09_

HueMark does not collect, transmit, or sell any user data.

## What HueMark stores, and where

- Your search terms, their assigned colors, your saved term lists (up to 10
  lists, each with its own terms and colors), and your settings (whole-word
  matching, colorblind palette, toolbar position, etc.) are saved using the
  browser's built-in `chrome.storage.local` API.
- Your Copy matches preferences (format, mode, citation style) and whether the
  popup's "Advanced" section was left open are saved the same way.
- Whether you have seen or dismissed the one-time keyboard-shortcut tip is
  saved the same way.
- When Copy matches has collected a result that you have not copied yet, that
  result (the matched text with the text around it) is held in the browser's
  session storage. Session storage is cleared when the browser closes. If the
  browser has no session storage, the result is kept in `chrome.storage.local`
  instead, until you copy it.
- HueMark is off in every tab until you switch it on for that tab. To remember
  which tabs are switched on, it keeps an in-memory list of browser tab numbers
  in session storage. It stores no website addresses, site names, page titles
  or browsing history, and the list is cleared when a tab or the browser closes.
- This data is stored **only on your own device**. It is never synced to a
  server, sent to HueMark's developer, or shared with any third party.
- Uninstalling the extension removes this data.

## Copy matches and the clipboard

- When you click Copy matches, HueMark reads the text of the page you are on,
  including its embedded frames, in your browser. This happens only after you
  start Copy matches. It can continue while the popup is closed.
- Text is written to your clipboard only when you click Copy. HueMark does not
  read your clipboard.
- The collected text is not sent anywhere.

## What HueMark does not do

- No analytics, telemetry, or usage tracking.
- No external servers of any kind. HueMark makes no network requests on your
  behalf, other than loading a PDF you open in its bundled viewer.
- No advertising or ad networks.
- No sale or sharing of data, because none is collected in the first place.

## Permissions

HueMark requests these permissions: `storage`, `scripting`, `activeTab`,
`declarativeNetRequest`, `contextMenus`, and host access to all sites
(`<all_urls>`). They are used only to:

- highlight text on any page or PDF you choose to use HueMark on;
- read the page's text for Copy matches, when you ask for it;
- redirect PDF navigations to HueMark's bundled PDF.js viewer, because browsers
  don't allow third-party scripts inside their built-in PDF viewer; and
- add an "Add selection to HueMark" item to the right-click menu for selected
  text.

None of these permissions are used to collect or transmit data.

## Contact

Questions about this policy can be raised via the [HueMark GitHub
repository](https://github.com/nawaz13bit/HueMark).
