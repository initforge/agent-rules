"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopMCPAdapter = void 0;
const mcp_1 = require("@ha/mcp");
const electron_1 = require("electron");
const config_1 = require("./config");
const logger_1 = require("./logger");
class DesktopMCPAdapter {
    constructor(appPath) {
        this.appPath = appPath;
        this.log = logger_1.logger;
    }
    getInstallationPath() {
        return this.appPath;
    }
    getExternalExtensionPath(_extensionId) {
        return undefined;
    }
    getAppPath() {
        return electron_1.app.getPath("appData");
    }
    getAppName() {
        return "desktop";
    }
    static getSupportedIntegrations() {
        return [
            "claudeCodeCLI",
            "codexCLI",
            "geminiCLI",
            "antigravity",
            "openCodeCLI",
            "kiroCLI",
            "claudeDesktop",
        ];
    }
    async setupIntegrations(enabledIntegrations) {
        const supportedIntegrations = DesktopMCPAdapter.getSupportedIntegrations();
        // If enabledIntegrations are missing that means this is "first-time" with enabledIntegrations,
        // so let's use supported.
        if (!enabledIntegrations) {
            enabledIntegrations = supportedIntegrations;
        }
        enabledIntegrations = enabledIntegrations.filter((i) => supportedIntegrations.includes(i));
        // Remove the union of enabled and supported integrations, so we can clean
        // up integrations that got unspported.
        const toRemove = [
            ...new Set([...enabledIntegrations, ...supportedIntegrations]),
        ];
        await (0, mcp_1.removeIntegrations)(this, toRemove);
        const activeIntegrations = await (0, mcp_1.activateIntegrations)(this, enabledIntegrations);
        config_1.desktopConfig.set("enabledIntegrations", activeIntegrations);
    }
    async toggleIntegration(integration, state) {
        const supportedIntegrations = DesktopMCPAdapter.getSupportedIntegrations();
        if (!supportedIntegrations.includes(integration)) {
            logger_1.logger.warn(`cannot enable unsupported integration: ${integration}`);
            return;
        }
        let enabledIntegrations = config_1.desktopConfig.get("enabledIntegrations");
        if (state) {
            if (!enabledIntegrations.includes(integration)) {
                enabledIntegrations.push(integration);
            }
        }
        else {
            enabledIntegrations = enabledIntegrations.filter((i) => i !== integration);
        }
        await this.setupIntegrations(enabledIntegrations);
    }
}
exports.DesktopMCPAdapter = DesktopMCPAdapter;
