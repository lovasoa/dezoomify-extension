const META_REGEX = /\/ImageProperties.xml|\/info.json|\?FIF=|\.dzi$|\.img.\?cmd=info|\.pff$|\.ecw$|artsandculture\.google\.com\/asset\/|\/tiles/i;
const DEZOOMIFY_URL = "https://ophir.alwaysdata.net/dezoomify/dezoomify.html#";

/**
 * @type Map<number, Set<{url, tabId, timeStamp}>>
 */
const found_images = new Map;

function foundZoomableImage(request) {
    let found = found_images.get(request.tabId) || new Set;
    found.add(request);
    found_images.set(request.tabId, found);
    chrome.pageAction.show(request.tabId);
}

function handleRequest(request) {
    if (META_REGEX.test(request.url) && !request.url.startsWith(DEZOOMIFY_URL)) {
        foundZoomableImage(request);
    }
}

const VALID_RESOURCE_TYPES = new Set(Object.values(chrome.webRequest.ResourceType));

chrome.webRequest.onCompleted.addListener(handleRequest, {
    urls: ["<all_urls>"],
    types: [
        "main_frame",
        "object",
        "object_subrequest",
        "sub_frame",
        "xmlhttprequest",
        "other"
    ].filter(t => VALID_RESOURCE_TYPES.has(t))
});

/**
 * Delete old zoomable images found for a tab
 */
function deleteSavedImages({ tabId }) {
    const found = found_images.get(tabId);
    if (!found) return;
    const now = Date.now();
    for (const request of found) {
        if (now - request.timeStamp >= 5000) {
            found.delete(request);
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

function openDezoomify(request) {
    const url = DEZOOMIFY_URL + request.url;
    return chrome.tabs.create({ url })
}

async function handleIconClick(tab) {
    const found = found_images.get(tab.id);
    if (!found || found.length == 0) {
        throw new Error(`Dezoomify icon clicked on a tab (${tab.id}) without any zoomable images (${found}).`);
    }
    found.forEach(openDezoomify);
}

chrome.pageAction.onClicked.addListener(handleIconClick);