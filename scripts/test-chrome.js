const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const failures = [];

if (manifest.manifest_version !== 3) {
    failures.push("manifest_version must be 3");
}

if (!manifest.action || !manifest.action.default_title) {
    failures.push("action.default_title is required");
}

if (!manifest.action || !manifest.action.default_icon) {
    failures.push("action.default_icon is required");
}

if (!manifest.background || !manifest.background.service_worker) {
    failures.push("background.service_worker is required");
}

if (!Array.isArray(manifest.permissions) || !manifest.permissions.includes("webRequest")) {
    failures.push("permissions must include webRequest");
}

if (!Array.isArray(manifest.permissions) || !manifest.permissions.includes("contextMenus")) {
    failures.push("permissions must include contextMenus");
}

if (!Array.isArray(manifest.host_permissions) || !manifest.host_permissions.includes("<all_urls>")) {
    failures.push("host_permissions must include <all_urls>");
}

if (failures.length) {
    console.error("Chrome manifest checks failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("Chrome manifest checks passed.");
