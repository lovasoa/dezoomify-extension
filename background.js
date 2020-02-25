const META_REGEX = /\/ImageProperties.xml|\/info.json|\?FIF=|\.dzi$|\.img.\?cmd=info|\.pff(&requestType=1)?$|\.ecw$|artsandculture\.google\.com\/asset\//i;
const META_REPLACE = [
    { pattern: /_files\/\d+\/\d+_\d+.jpg$/, replacement: '.dzi' },
    { pattern: /\/TileGroup\d+\/\d+-\d+-\d+.jpg$/, replacement: '/ImageProperties.xml' },
    { pattern: /\/ImageProperties\.xml\?t\w+$/, replacement: '/ImageProperties.xml' },
    { pattern: /(artsandculture\.google\.com\/asset\/.+\/.+)\?.*/, replacement: '$1' },
];
const DEZOOMIFY_URL = "https://ophir.alwaysdata.net/dezoomify/dezoomify.html#";
const MIN_REQUEST_TIME = 1000; // Minimum amount of time to keep a request in cache (ms)

/**
 * A network request
 * @typedef {{url:string, tabId:number, timeStamp:number}} WebRequest
 */

/**
 * Maps a tab id to a set of requests.
 * The requests are stored as a map from url to Request object.
 * @type Map<number, Map<string, WebRequest>>
 */
const found_images = new Map;

/**
 * Adds a request to the cached zoomable image requests
 * @param {WebRequest} request 
 */
function foundZoomableImage(request) {
    let found = found_images.get(request.tabId) || new Map;
    found.set(request.url, request);
    found_images.set(request.tabId, found);
    chrome.browserAction.setBadgeText({
        text: found.size.toString(),
        tabId: request.tabId
    });
}

// @ts-ignore
const VALID_RESOURCE_TYPES = new Set(Object.values(chrome.webRequest['ResourceType']));

/**
 * @param {WebRequest} request 
 */
function handleRequest(request) {
    for (const { pattern, replacement } of META_REPLACE) {
        request.url = request.url.replace(pattern, replacement);
    }
    if (META_REGEX.test(request.url) && !request.url.startsWith(DEZOOMIFY_URL)) {
        foundZoomableImage(request);
    }
};

/**
 * Delete old zoomable images found for a tab
 * This deletes only requests that are older than MIN_REQUEST_TIME,
 * so that if a page loads and then quickly changes its adress, its requests are not lost.
 * @param {{tabId:number}} request 
 */
function deleteSavedImages({ tabId }) {
    const found = found_images.get(tabId);
    if (!found) return;
    const now = Date.now();
    for (const [url, request] of found) {
        if (now - request.timeStamp >= MIN_REQUEST_TIME) {
            found.delete(url);
        }
    }
    if (found.size === 0) {
        found_images.delete(tabId);
    }
    chrome.browserAction.setBadgeText({ text: (found.size || "").toString(), tabId });
}


/**
 * If the history is updated programmatically, we need to test the new URL
 * @param {WebRequest} newPage 
 */
function pageChanged(newPage) {
    deleteSavedImages(newPage);
    handleRequest({ ...newPage, timeStamp: Date.now() });
}

/**
 * Open dezoomify in a tab
 * @param {WebRequest} request 
 */
function openDezoomify(request) {
    const url = DEZOOMIFY_URL + request.url;
    return chrome.tabs.create({ url })
}

chrome.webNavigation.onBeforeNavigate.addListener(deleteSavedImages);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(deleteSavedImages);
chrome.webNavigation.onHistoryStateUpdated.addListener(pageChanged);

/**
 * @param {number} tabId 
 */
function add_listeners(tabId) {
    /**
     * Selector for which requests we want to intercept
     * @type chrome.webRequest.RequestFilter
     */
    const REQUESTS_FILTER = {
        tabId,
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
    chrome.webRequest.onCompleted.addListener(handleRequest, REQUESTS_FILTER);
}

function remove_listeners() {
    chrome.webRequest.onCompleted.removeListener(handleRequest);
}

/**
 * Handle clicks on the extension's icon
 */
chrome.browserAction.onClicked.addListener(async function handleIconClick(tab) {
    if (!tab.id || !tab.url) throw new Error(`Invalid tab: ${JSON.stringify(tab)}`);
    const found = found_images.get(tab.id);
    if (!found || found.size == 0) {
        add_listeners(tab.id);
        chrome.tabs.reload(tab.id, { bypassCache: true });
    } else {
        found.forEach(openDezoomify);
        found_images.delete(tab.id);
        chrome.browserAction.setBadgeText({ text: "", tabId: tab.id });
        remove_listeners();
    }
});

/**
 * Add a right-click action to report bugs
 */
chrome.contextMenus.removeAll();
[
    {
        title: "Usage instructions and information",
        url: 'https://github.com/lovasoa/dezoomify-extension/#dezoomify-extension',
    },
    {
        title: "Open Dezoomify",
        url: 'https://ophir.alwaysdata.net/dezoomify/dezoomify.html',
    },
    {
        title: "Report a problem with this extension",
        url: 'https://github.com/lovasoa/dezoomify-extension/issues/new',
    },
    {
        title: "Support me, the developer !",
        url: "https://github.com/sponsors/lovasoa"
    }
].forEach(({ title, url }) => {
    chrome.contextMenus.create({
        title,
        contexts: ["browser_action"],
        onclick() { chrome.tabs.create({ url, active: true, }) }
    });
});