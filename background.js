const META_REGEX = /\/ImageProperties.xml|\/info.json|\?FIF=|\.dzi$|\.img.\?cmd=info|\.pff$|\.ecw$|artsandculture\.google\.com|\/tiles/i;
const DEZOOMIFY_URL = "https://ophir.alwaysdata.net/dezoomify/dezoomify.html#";

/**
 * @type Map<number, Set<string>>
 */
const found_images = new Map;

async function foundZoomableImage(url, tabId) {
    let found = found_images.get(tabId) || new Set;
    found.add(url);
    found_images.set(tabId, found);
    await browser.pageAction.show(tabId);
}

function handleRequest({ url, tabId }) {
    if (META_REGEX.test(url) && !url.startsWith(DEZOOMIFY_URL)) {
        foundZoomableImage(url, tabId);
    }
}

browser.webRequest.onCompleted.addListener(handleRequest, {
    urls: ["<all_urls>"],
    types: [
        "main_frame",
        "object",
        "object_subrequest",
        "sub_frame",
        "xmlhttprequest",
        "other"
    ]
});

async function handleNavigation({ tabId }) {
    // We are leaving a page, so we don't need to store information about it anymore
    found_images.delete(tabId);
    await browser.pageAction.hide(tabId);
}
browser.webNavigation.onBeforeNavigate.addListener(handleNavigation);

async function openDezoomify(image_url) {
    const url = DEZOOMIFY_URL + image_url;
    return await browser.tabs.create({ url })
}

async function handleIconClick(tab) {
    const found = found_images.get(tab.id);
    if (!found || found.length == 0) {
        throw new Error(`Dezoomify icon clicked on a tab (${tab.id}) without any zoomable images (${found}).`);
    }
    newTabs = Array.from(found).map(openDezoomify);
    await Promise.all(newTabs);
}

browser.pageAction.onClicked.addListener(handleIconClick);