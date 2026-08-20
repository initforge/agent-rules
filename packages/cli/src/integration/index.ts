export { detectPlatform, expandInstallDir, resolveInstallDir } from "./platform-detect.js";
export type { Platform, PlatformInfo, Arch } from "./platform-detect.js";

export { npmInstall, npmVerify, npmUninstall } from "./handlers/npm.js";
export { binaryInstall, binaryVerify, binaryUninstall } from "./handlers/binary.js";
export { shellInstall, shellVerify, shellUninstall } from "./handlers/shell.js";

export { handlerForRegistryEntry, registerHandler, getHandlerOverride, clearHandlerOverrides, resolveIntegrationManifestDir } from "./installer-registry.js";
export type { IntegrationHandler, HandlerResult } from "./installer-registry.js";

export { loadIntegrationInventory } from "./inventory.js";
export type { IntegrationInventory, RegistryEntry, RegistryInstall, RegistrySource } from "./inventory.js";

export { provisionMcps, verifyMcps, uninstallMcps } from "./provisioning.js";
export type { ProvisionOptions, ProvisionSummary } from "./provisioning.js";

export { activationFor, aggregateProvisioning } from "./provider-result.js";
export type { ProviderResult, ProviderInstallation, ProviderActivation } from "./provider-result.js";