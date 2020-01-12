const META_REGEX = /\/ImageProperties.xml|\/info.json|\?FIF=|\.dzi$|\.img.\?cmd=info|\.pff$|\.ecw$|artsandculture\.google\.com\/asset\/|\/tiles/i;
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
    chrome.pageAction.show(request.tabId);
}

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
        "object",
        "object_subrequest",
        "sub_frame",
        "xmlhttprequest",
        "other"
    ].filter(t => VALID_RESOURCE_TYPES.has(t))
};

chrome.webRequest.onCompleted.addListener(function handleRequest(request) {
    if (META_REGEX.test(request.url) && !request.url.startsWith(DEZOOMIFY_URL)) {
        foundZoomableImage(request);
    }
}, REQUESTS_FILTER);

/**
 * Delete old zoomable images found for a tab
 * This deletes only requests that are older than MIN_REQUEST_TIME,
 * so that if a page loads and then quickly changes its adress, its requests are not lost.
 * @param {WebRequest} request 
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
        chrome.pageAction.hide(tabId);
        found_images.delete(tabId);
    }
}

// When we are leaving a page, we don't need to store information about it anymore
chrome.webNavigation.onBeforeNavigate.addListener(deleteSavedImages);
chrome.webNavigation.onHistoryStateUpdated.addListener(deleteSavedImages);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(deleteSavedImages);

/**
 * Open dezoomify in a tab
 * @param {WebRequest} request 
 */
function openDezoomify(request) {
    const url = DEZOOMIFY_URL + request.url;
    return chrome.tabs.create({ url })
}

chrome.pageAction.onClicked.addListener(async function handleIconClick(tab) {
    if (tab.id == null) return;
    const found = found_images.get(tab.id);
    if (!found || found.size == 0) {
        throw new Error(`Dezoomify icon clicked on a tab (${tab.id}) without any zoomable images (${found}).`);
    }
    found.forEach(openDezoomify);
});