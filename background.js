/*  Dezoomify-extension – background service-worker (Manifest V3)
    --------------------------------------------------------------------
    This is a 1-for-1 port of the original MV2 background script.
    Main differences:
      • Runs as a **service-worker** (declared in manifest.json).
      • All chrome.browserAction.* API calls → chrome.action.* .
      • Context-menu context changed to "action".
      • Removed the setInterval heartbeat (worker wakes on events).
      • getManifest() now returns manifest.action instead of browser_action.
      • updateStatus() chooses icons from manifest.action.default_icon.
    Everything else (regexes, request listener, menu actions) is unchanged.
*/

const DEZOOMIFY_URL = "https://dezoomify.ophir.dev/#";

/* ---------------- zoom-format detection regexes (unchanged) ---------------- */

const iiifpath = new RegExp(
  "/\\^?(full|square|(pct:)?\\d+,\\d+,\\d+,\\d+)" +            // region
  "/(full|max|\\d+,|,\\d+|pct:\\d+|!?\\d+,\\d+)" +             // size
  "/!?[1-3]?[0-9]?[0-9]" +                                     // rotation
  "/(color|gray|bitonal|default|native)" +                     // quality
  "\\.(jpe?g|tiff?|png|gif|jp2|pdf|webp)"                      // format
);

const META_REGEX = new RegExp([
  /\/ImageProperties.xml/,                                     // Zoomify
  /\/info.json/,                                               // IIIF
  /\?FIF=/,                                                    // IIPImage
  /_files\/0\/0_0.jpg(?:\?.*)?$/,                              // OpenSeadragon
  /\.img.\?cmd=info/,
  /getTilesInfo\?object_id/,
  /\.pff(&requestType=1)?$/,                                   // Zoomify PFF
  /\.ecw(?:\?.*)?$/,                                           // Hungaricana
  /\/p.xml(?:\?.*)?$/,                                         // Mnesys
  iiifpath,
  /artsandculture\.google\.com\/asset\//                       // Google Arts
].map(e => e.source).join('|'));

const META_REPLACE = [
  { pattern: /\.dzi(?:\?.*)?$/,                   replacement: '_files/0/0_0.jpg' },
  { pattern: /_files\/\d+\/\d+_\d+\.jpg(?:\?.*)?$/, replacement: '_files/0/0_0.jpg' },
  { pattern: /\/TileGroup\d+\/\d+-\d+-\d+.jpg(?:\?.*)?$/,      replacement: '/ImageProperties.xml' },
  { pattern: /\/ImageProperties\.xml\?t\w+$/,   replacement: '/ImageProperties.xml' },
  { pattern: /(\?FIF=[^&]*)&.*/,                replacement: '$1' },               // IIPImage
  { pattern: /(http.*artsandculture\.google\.com\/asset\/.+\/.+)\?.*/, replacement: '$1' },
  { pattern: iiifpath,                          replacement: '/info.json' },
  { pattern: /getTilesInfo\?object_id=(.*)&callback.*/, replacement: 'getTilesInfo?object_id=$1' },
];

/* ---------------- webRequest filter setup (unchanged) --------------------- */

// @ts-ignore – Chrome’s enum value map
const VALID_RESOURCE_TYPES = new Set(Object.values(chrome.webRequest["ResourceType"]));

/** @type {chrome.webRequest.RequestFilter} */
const REQUESTS_FILTER = {
  urls: [""],
  // @ts-ignore
  types: [
    "main_frame", "image", "object", "object_subrequest",
    "sub_frame", "xmlhttprequest", "script", "other"
  ].filter(t => VALID_RESOURCE_TYPES.has(t))
};

/** Tab-id → PageListener */
const page_listeners = new Map();

/* -------------------------------------------------------------------------- */
/*                               UI HELPERS                                   */
/* -------------------------------------------------------------------------- */

function setBadge(tabId, text = "")   { chrome.action.setBadgeText({ tabId, text }); }
function setTitle(tabId, title = "")  { chrome.action.setTitle({ tabId, title });    }
function setIcon(tabId, path)         { chrome.action.setIcon({ tabId, path });      }
function getTitle(tabId, cb)          { chrome.action.getTitle({ tabId }, cb);       }

/**
 * @returns {{action: chrome.runtime.ManifestAction}&chrome.runtime.Manifest}
 */
function getManifest() {
  const { action, ...rest } = chrome.runtime.getManifest();
  if (!action) throw new Error("Invalid manifest – missing 'action'");
  return { action, ...rest };
}

/* -------------------------------------------------------------------------- */
/*                         EXTENSION ICON CLICK HANDLER                       */
/* -------------------------------------------------------------------------- */

/**
 * Handle a click on the extension icon
 * @param {chrome.tabs.Tab} uncheckedTab
 */
async function click(uncheckedTab) {
  const tab = checkTab(uncheckedTab);
  setBadge(tab.id, "…");

  const listener = page_listeners.get(tab.id);
  if (listener && listener.isListening()) {
    listener.openFound();
    listener.close();
    page_listeners.delete(tab.id);
  } else {
    if (listener) listener.close();               // clean stale listener
    page_listeners.set(tab.id, new PageListener(tab));
  }
}
chrome.action.onClicked.addListener(click);

/* Remove page listeners when their tab closes */
chrome.tabs.onRemoved.addListener(tabID => {
  const listener = page_listeners.get(tabID);
  if (listener) {
    listener.stop();
    page_listeners.delete(tabID);
  }
});

/* -------------------------------------------------------------------------- */
/*                               PAGE LISTENER                                */
/* -------------------------------------------------------------------------- */

class PageListener {
  /** @param {chrome.tabs.Tab} tab */
  constructor(tab) {
    this.tab   = checkTab(tab);
    this.found = new Set();                       // URLs of detected images

    // Bind request handler
    this.listener = this.handleRequest.bind(this);
    const filter  = { tabId: this.tab.id, ...REQUESTS_FILTER };
    chrome.webRequest.onBeforeRequest.addListener(this.listener, filter);

    // Treat the tab’s own main-frame request (useful on first click)
    this.handleRequest(this.tab);

    // Immediate UI update (no setInterval heartbeat)
    this.updateStatus();
  }

  /* ----- lifecycle helpers ----- */

  stop() { chrome.webRequest.onBeforeRequest.removeListener(this.listener); }

  close() {
    this.stop();
    this.found.clear();
    this.updateStatus();
  }

  /** @returns {boolean} */
  isListening() { return chrome.webRequest.onBeforeRequest.hasListener(this.listener); }

  /** @returns {Promise<boolean>} */
  hasVisibleResults() {
    return new Promise(resolve => {
      getTitle(this.tab.id, title => {
        resolve(title !== getManifest().action.default_title);
      });
    });
  }

  /* ----- request sniffing ----- */

  /**
   * @param {{url:string}} request
   */
  handleRequest({ url }) {
    for (const { pattern, replacement } of META_REPLACE) {
      url = url.replace(pattern, replacement);
    }
    if (META_REGEX.test(url) && !url.startsWith(DEZOOMIFY_URL)) {
      this.foundZoomableImage(url);
    }
  }

  /**
   * Cache a detected zoomable image URL
   * @param {string} url
   */
  foundZoomableImage(url) {
    const parsed = new URL(url);

    // Ensure https takes precedence to avoid duplicates
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      if (this.found.has(parsed.toString())) return;
    } else if (parsed.protocol === "https:") {
      parsed.protocol = "http:";
      this.found.delete(parsed.toString());
    }
    this.found.add(url);
    this.updateStatus();          // direct call replaces old setInterval heartbeat
  }

  /* ----- UI updates ----- */

  updateStatus() {
    const manifest = getManifest();
    const found    = this.found.size;
    const tabId    = this.tab.id;
    const { host } = new URL(this.tab.url);

    let badge = found ? String(found) : "";
    let title = "";

    if (!this.isListening()) {
      badge = "";
      title = manifest.action.default_title;
    } else if (found === 0) {
      title = `Listening for zoomable image requests from ${host}…\nZoom on your image and it should be detected.`;
    } else if (found === 1) {
      title = `Found a zoomable image on ${host}. Click to open it.`;
    } else {
      title = `Found ${found} images on ${host}. Click to open them.`;
    }

    setBadge(tabId, badge);
    setTitle(tabId, title);

    const path = this.isListening()
      ? manifest.icons                   // coloured icons
      : manifest.action.default_icon;    // grey icons
    setIcon(tabId, path);
  }

  /* ----- open detected images ----- */

  openFound() { for (const url of this.found) openDezoomify(url); }
}

/* -------------------------------------------------------------------------- */
/*                            DEZOOMIFY TAB OPENER                            */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} image_url
 * @returns {Promise<chrome.tabs.Tab>}
 */
function openDezoomify(image_url) {
  return chrome.tabs.create({ url: DEZOOMIFY_URL + image_url });
}

/* -------------------------------------------------------------------------- */
/*                                UTILITIES                                   */
/* -------------------------------------------------------------------------- */

/**
 * Throw if a tab lacks id or url
 * @typedef {{id:number,url:string}&chrome.tabs.Tab} GoodTab
 * @param {chrome.tabs.Tab} tab
 * @returns {GoodTab}
 */
function checkTab(tab) {
  if (!tab.id || !tab.url) throw new Error(`Bad tab: ${JSON.stringify(tab)}`);
  // @ts-ignore
  return tab;
}

/** Same-origin test (unused but kept from original) */
function sameSite(u1, u2) { return new URL(u1).origin === new URL(u2).origin; }

/* -------------------------------------------------------------------------- */
/*                          CONTEXT-MENU DEFINITION                           */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {{
 *   title: string,
 *   url?: string,
 *   onclick?: (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) => void
 * }} MenuAction
 */

/** @type {MenuAction[]} */
const DEFAULT_MENU_ACTIONS = [
  {
    title: "Usage instructions and information",
    url:   "https://github.com/lovasoa/dezoomify-extension/#dezoomify-extension",
  },
  {
    title: "Open the Dezoomify website",
    onclick(_info, tab) { openDezoomify(checkTab(tab).url); },
  },
  {
    title: "Deactivate dezoomify on all tabs",
    onclick() {
      for (const l of page_listeners.values()) l.close();
      page_listeners.clear();
    },
  },
  {
    title: "Report a problem with this extension",
    url:   "https://github.com/lovasoa/dezoomify-extension/issues/new",
  },
  {
    title: "Support me, the developer !",
    url:   "https://github.com/sponsors/lovasoa",
  },
];

/* register context-menu items – contexts:["action"] for MV3 */
chrome.contextMenus.removeAll();
DEFAULT_MENU_ACTIONS.forEach(({ title, url, onclick }, index) =>
  chrome.contextMenus.create({
    id: `menu-item-${index}`,
    title,
    contexts: ["action"],
  })
);

/* Handle context menu clicks */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const menuIndex = parseInt(info.menuItemId.replace('menu-item-', ''));
  const menuAction = DEFAULT_MENU_ACTIONS[menuIndex];
  
  if (menuAction.onclick) {
    menuAction.onclick(info, tab);
  } else if (menuAction.url) {
    chrome.tabs.create({ url: menuAction.url, active: true });
  }
});