const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium, firefox } = require("playwright");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const manifestPath = path.join(rootDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const addonId = manifest.browser_specific_settings
    && manifest.browser_specific_settings.gecko
    && manifest.browser_specific_settings.gecko.id;

const browserArg = process.argv.find((value) => value.startsWith("--browser="));
const target = browserArg ? browserArg.split("=")[1] : "all";
const allowed = new Set(["all", "chromium", "firefox"]);

if (!allowed.has(target)) {
    console.error("Unsupported browser target.");
    process.exit(1);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testChromium() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dezoomify-chromium-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${rootDir}`,
            `--load-extension=${rootDir}`
        ]
    });
    try {
        const existing = context.serviceWorkers().find((worker) => worker.url().startsWith("chrome-extension://"));
        const worker = existing || await context.waitForEvent("serviceworker", { timeout: 15000 });
        if (!worker.url().startsWith("chrome-extension://")) {
            throw new Error("Chrome extension service worker not detected");
        }
    } finally {
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
        let installed = false;
        const detectInstall = () => new Promise((resolve, reject) => {
            const onData = (data) => {
                const text = data.toString();
                if (text.includes("Installed") && text.includes("temporary add-on")) {
                    installed = true;
                    resolve();
                }
                if (text.includes("WebExtError") || text.includes("Could not install add-on")) {
                    reject(new Error("Firefox extension failed to load"));
                }
            };
            proc.stdout.on("data", onData);
            proc.stderr.on("data", onData);
            proc.on("exit", (code) => {
                if (installed) {
                    resolve();
                } else {
                    reject(new Error(`Firefox exited before install (${code})`));
                }
            });
        });
        await Promise.race([
            detectInstall(),
            delay(30000).then(() => { throw new Error("Firefox extension load timed out"); })
        ]);
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
    if (target === "chromium") {
        await testChromium();
        console.log("Chromium extension loaded.");
        return;
    }
    if (target === "firefox") {
        await testFirefox();
        console.log("Firefox extension loaded.");
        return;
    }
    await testChromium();
    await testFirefox();
    console.log("Chromium and Firefox extensions loaded.");
}

run().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    console.error(message);
    process.exit(1);
});
