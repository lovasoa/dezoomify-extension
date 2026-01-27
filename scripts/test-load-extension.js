const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium, firefox } = require("playwright");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
const addonId = manifest.browser_specific_settings
    && manifest.browser_specific_settings.gecko
    && manifest.browser_specific_settings.gecko.id;
const target = (() => {
    const arg = process.argv.find((value) => value.startsWith("--browser="));
    return arg ? arg.split("=")[1] : "all";
})();
const allowed = new Set(["all", "chromium", "firefox"]);

if (!allowed.has(target)) {
    console.error("Unsupported browser target.");
    process.exit(1);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (fn, timeoutMs, intervalMs = 250) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await fn();
        if (result) return result;
        await delay(intervalMs);
    }
    return null;
};

const getServiceWorker = async (context) => {
    const existing = context.serviceWorkers().find((worker) => worker.url().startsWith("chrome-extension://"));
    return existing || context.waitForEvent("serviceworker", { timeout: 15000 });
};

const findTab = (worker, pattern) => worker.evaluate((urlPattern) => {
    return new Promise((resolve) => {
        chrome.tabs.query({ url: urlPattern }, (tabs) => {
            const match = tabs[0];
            resolve(match ? { id: match.id, url: match.url } : null);
        });
    });
}, pattern);

const getBadge = (worker, tabId) => worker.evaluate((activeTabId) => {
    return new Promise((resolve) => {
        const actionApi = chrome.action || chrome.browserAction;
        actionApi.getBadgeText({ tabId: activeTabId }, resolve);
    });
}, tabId);

const waitForProcessOutput = (proc, success, failure, timeoutMs) => new Promise((resolve, reject) => {
    const onData = (data) => {
        const text = data.toString();
        if (failure && failure.test(text)) {
            cleanup();
            reject(new Error("Firefox extension failed to load"));
        }
        if (success && success.test(text)) {
            cleanup();
            resolve();
        }
    };
    const onExit = (code) => {
        cleanup();
        reject(new Error(`Firefox exited before install (${code})`));
    };
    const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Firefox extension load timed out"));
    }, timeoutMs);
    const cleanup = () => {
        clearTimeout(timeout);
        proc.stdout.off("data", onData);
        proc.stderr.off("data", onData);
        proc.off("exit", onExit);
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", onExit);
});

async function testChromium() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dezoomify-chromium-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${rootDir}`,
            `--load-extension=${rootDir}`
        ]
    });
    let page;
    let dezoomifyPage;
    try {
        const worker = await getServiceWorker(context);
        if (!worker.url().startsWith("chrome-extension://")) {
            throw new Error("Chrome extension service worker not detected");
        }
        page = await context.newPage();
        await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
        const urlPattern = new URL(page.url()).origin + "/*";
        const tab = await findTab(worker, urlPattern);
        if (!tab || !tab.id || !tab.url) {
            throw new Error("Active tab not found");
        }
        await worker.evaluate((activeTab) => globalThis.click(activeTab), tab);
        const requestPromise = page.waitForRequest(
            (request) => request.url().includes("/info.json"),
            { timeout: 10000 }
        );
        await page.evaluate(() => {
            const img = document.createElement("img");
            img.src = `https://example.com/info.json?ts=${Date.now()}`;
            document.body.appendChild(img);
        });
        await requestPromise;
        const badge = await waitFor(() => getBadge(worker, tab.id), 15000);
        if (!badge) {
            throw new Error("Extension did not detect the test request");
        }
        const pagePromise = context.waitForEvent("page", { timeout: 15000 }).catch(() => null);
        await worker.evaluate((activeTab) => globalThis.click(activeTab), tab);
        const candidate = await pagePromise;
        if (candidate) {
            await candidate.waitForLoadState("domcontentloaded").catch(() => null);
        }
        dezoomifyPage = await waitFor(() => {
            const match = context.pages().find((p) => p.url().startsWith("https://dezoomify.ophir.dev/#"));
            if (match) return match;
            if (candidate && candidate.url().startsWith("https://dezoomify.ophir.dev/#")) return candidate;
            return null;
        }, 15000);
        if (!dezoomifyPage) {
            throw new Error("Dezoomify tab not opened");
        }
    } finally {
        if (dezoomifyPage && !dezoomifyPage.isClosed()) {
            await dezoomifyPage.close();
        }
        if (page && !page.isClosed()) {
            await page.close();
        }
        await context.close();
    }
}

async function testFirefox() {
    if (!addonId) {
        throw new Error("Firefox add-on id missing");
    }
    const webExtBin = path.join(rootDir, "node_modules", ".bin", "web-ext");
    if (!fs.existsSync(webExtBin)) {
        throw new Error("web-ext not installed");
    }
    const firefoxPath = process.env.FIREFOX_BIN || firefox.executablePath();
    const args = [
        "run",
        "--no-input",
        "--no-reload",
        "--source-dir",
        rootDir,
        "--firefox",
        firefoxPath,
        "--pref=extensions.manifestV3.enabled=true",
        "--pref=extensions.background.service_worker.enabled=true",
        "--pref=extensions.install.requireBuiltInCerts=false",
        "--pref=extensions.autoDisableScopes=0",
        "--pref=extensions.enabledScopes=15",
        "--start-url",
        "about:blank"
    ];
    const proc = spawn(webExtBin, args, { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    try {
        await waitForProcessOutput(
            proc,
            /Installed .*temporary add-on/,
            /WebExtError|Could not install add-on/,
            30000
        );
    } finally {
        proc.kill("SIGTERM");
        await Promise.race([
            new Promise((resolve) => proc.once("exit", resolve)),
            delay(5000)
        ]);
        if (!proc.killed) {
            proc.kill("SIGKILL");
        }
    }
}

async function run() {
    const runners = { chromium: testChromium, firefox: testFirefox };
    if (target === "all") {
        await runners.chromium();
        await runners.firefox();
        console.log("Chromium and Firefox extensions loaded.");
        return;
    }
    await runners[target]();
    console.log(`${target === "chromium" ? "Chromium" : "Firefox"} extension loaded.`);
}

run().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    console.error(message);
    process.exit(1);
});
