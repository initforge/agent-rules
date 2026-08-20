export { detectPlatform, expandInstallDir } from "./platform-detect.js";
export type { Platform, PlatformInfo, Arch } from "./platform-detect.js";

export { npmInstall, npmVerify, npmUninstall } from "./handlers/npm.js";
export { binaryInstall, binaryVerify, binaryUninstall } from "./handlers/binary.js";
export { shellInstall, shellVerify, shellUninstall } from "./handlers/shell.js";

export { getHandler, registerHandler, listRegistrations } from "./installer-registry.js";
export type { IntegrationHandler } from "./installer-registry.js";
