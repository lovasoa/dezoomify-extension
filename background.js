const DEZOOMIFY_URL = "https://ophir.alwaysdata.net/dezoomify/dezoomify.html#";

const META_REGEX = /\/ImageProperties.xml|\/info.json|\?FIF=|\.dzi$|\.img.\?cmd=info|\.pff(&requestType=1)?$|\.ecw$|artsandculture\.google\.com\/asset\//i;
const META_REPLACE = [
    { pattern: /_files\/\d+\/\d+_\d+.jpg$/, replacement: '.dzi' },
    { pattern: /\/TileGroup\d+\/\d+-\d+-\d+.jpg$/, replacement: '/ImageProperties.xml' },
    { pattern: /\/ImageProperties\.xml\?t\w+$/, replacement: '/ImageProperties.xml' },
    { pattern: /(http.*artsandculture\.google\.com\/asset\/.+\/.+)\?.*/, replacement: '$1' },
];
// @ts-ignore
const VALID_RESOURCE_TYPES = new Set(Object.values(chrome.webRequest['ResourceType']));

/**
 * Selector for which requests we want to intercept
 * @type chrome.webRequest.RequestFilter
 */
const REQUESTS_FILTER = {
    urls: ["<all_urls>"],
    // @ts-ignore
    types: [
        "main_frame",
        "image",
        "object",
        "object_subrequest",
        "sub_frame",
        "xmlhttprequest",
        "other"
    ].filter(t => VALID_RESOURCE_TYPES.has(t))
};

/** @type {Map<number, PageListener>} */
const page_listeners = new Map;

/**
 * Handle a click on the extension's icon
 * @param {chrome.tabs.Tab} unchecked_tab 
 */
function click(unchecked_tab) {
    const tab = checkTab(unchecked_tab);
    const listener = page_listeners.get(tab.id);
    if (listener) {
        // Open the images that may have been found, and stop the existing listener
        listener.openFound();
        listener.close();
        page_listeners.delete(checkTab(listener.tab).id);
    } else {
        // No existing listener, start the extension for this tab
        page_listeners.set(tab.id, new PageListener(tab));
    }
}

chrome.browserAction.onClicked.addListener(click);

/**
 * Tracks the state of dezoomify on a given tab
 */
class PageListener {
    /**
     * @param {chrome.tabs.Tab} tab 
     */
    constructor(tab) {
        this.listening = true;
        this.tab = tab;
        /** @type {Set<string>} */
        this.found = new Set;
        this.listener = this.handleRequest.bind(this);
        const filter = { tabId: this.tab.id, ...REQUESTS_FILTER };
        chrome.webRequest.onCompleted.addListener(this.listener, filter);
        this.updateStatus();
    }


    close() {
        chrome.webRequest.onCompleted.removeListener(this.listener);
        this.listening = false;
        this.found.clear();
        this.updateStatus();
    }

    /**
     * @param {chrome.webRequest.WebRequestDetails} request 
     */
    handleRequest(request) {
        for (const { pattern, replacement } of META_REPLACE) {
            request.url = request.url.replace(pattern, replacement);
        }
        if (META_REGEX.test(request.url) && !request.url.startsWith(DEZOOMIFY_URL)) {
            this.foundZoomableImage(request);
        }
    }

    /**
     * Adds a request to the cached zoomable image requests
     * @param {chrome.webRequest.WebRequestDetails} request 
     */
    foundZoomableImage(request) {
        this.found.add(request.url);
        this.updateStatus();
    }

    /**
     * Sets the extension's icon status
     */
    updateStatus() {
        const found = this.found.size;
        const badge = (found || '').toString();
        let title = '';
        if (found > 1) {
            title = `Found ${found} images. Click to open them.`
        } else if (found === 1) {
            title = "Found a zoomable image on this page. Click to open it.";
        } else if (this.listening) {
            title = 'Listening for zoomable image requests in this tab... ' +
                'Zoom on your image and it should be detected.';
        } else {
            title = 'Click to search for zoomable images in this page';
        }
        const tabId = this.tab.id;
        chrome.browserAction.setBadgeText({ text: badge, tabId });
        chrome.browserAction.setTitle({ title, tabId });
        const color = this.listening ? 'color' : 'grey';
        chrome.browserAction.setIcon({
            tabId,
            path: [24, 96, 128, 512].reduce((obj, size) => {
                // @ts-ignore
                obj[size.toString()] = `icons/${color}/icon-${size}.png`;
                return obj;
            }, {})
        });
    }

    openFound() {
        for (const url of this.found) openDezoomify(url);
    }
}


/**
 * Open dezoomify in a tab
 * @param {string} image_url 
 */
function openDezoomify(image_url) {
    const url = DEZOOMIFY_URL + image_url;
    return chrome.tabs.create({ url })
}

/**
 * Throw an error if a tab does not have an id or an URL
 * @typedef {{id:number, url:string} & chrome.tabs.Tab} GoodTab
 * @param {chrome.tabs.Tab} tab 
 * @returns {GoodTab}
 */
function checkTab(tab) {
    if (!tab.id || !tab.url) throw new Error(`bad tab: ${tab}`);
    // @ts-ignore
    return tab;
}

/**
 * A context menu action
 * @typedef {{
    *      title:string,
    *      url?:string,
    *      onclick?: (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) => void
    * }} MenuAction
    */

/**
 * @type {MenuAction[]}
 */
const DEFAULT_MENU_ACTIONS = [
    {
        title: "Usage instructions and information",
        url: 'https://github.com/lovasoa/dezoomify-extension/#dezoomify-extension',
    },
    {
        title: "Open Dezoomify",
        onclick(_info, tab) { openDezoomify(checkTab(tab).url) },
    },
    {
        title: "Stop dezoomify on all pages",
        onclick(_info, _tab) {
            for (const l of page_listeners.values()) l.close();
            page_listeners.clear();
        },
    },
    {
        title: "Report a problem with this extension",
        url: 'https://github.com/lovasoa/dezoomify-extension/issues/new',
    },
    {
        title: "Support me, the developer !",
        url: "https://github.com/sponsors/lovasoa"
    }
]

/**
 * Add right-click menu actions
 */
chrome.contextMenus.removeAll();
DEFAULT_MENU_ACTIONS.forEach(({ title, url, onclick }) => {
    chrome.contextMenus.create({
        title,
        contexts: ["browser_action"],
        onclick: onclick || (_ => chrome.tabs.create({ url, active: true, }))
    });
});
