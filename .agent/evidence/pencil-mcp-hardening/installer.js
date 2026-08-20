"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var installer_exports = {};
__export(installer_exports, {
  activateIntegrations: () => activateIntegrations,
  removeIntegrations: () => removeIntegrations
});
module.exports = __toCommonJS(installer_exports);
var fs = __toESM(require("node:fs"));
var os = __toESM(require("node:os"));
var path = __toESM(require("node:path"));
var toml = __toESM(require("smol-toml"));
var import_util = require("./util");
const MCP_CONFIG_MAP = {
  claudeCodeCLI: path.join(".claude.json"),
  codexCLI: path.join(".codex", "config.toml"),
  geminiCLI: path.join(".gemini", "settings.json"),
  windsurfIDE: path.join(".codeium", "windsurf", "mcp_config.json"),
  cursorCLI: path.join(".cursor", "mcp.json"),
  antigravityIDE: path.join(".gemini", "antigravity-ide", "mcp_config.json"),
  antigravity: path.join(".gemini", "antigravity", "mcp_config.json"),
  openCodeCLI: path.join(".config", "opencode", "opencode.json"),
  copilotIDE: path.join("mcp.json"),
  kiroCLI: path.join(".kiro", "settings", "mcp.json"),
  claudeDesktop: path.join("Claude", "claude_desktop_config.json")
};
const PENCIL_MCP_NAME = "pencil";
async function activateIntegrations(adapter, enabledIntegrations) {
  const activeIntegrations = [];
  for (const integration of enabledIntegrations) {
    try {
      await installMCP({ adapter, integration });
      adapter.log.info(`Successfully set up MCP server for ${integration}`);
      activeIntegrations.push(integration);
    } catch (err) {
      adapter.log.error("Failed to install MCP for global Codex CLI", err);
    }
  }
  return activeIntegrations;
}
async function removeIntegrations(adapter, integrationsToRemove) {
  for (const integration of integrationsToRemove) {
    try {
      await removeMCP({
        integration,
        adapter
      });
      adapter.log.info(`Uninstalled MCP server for ${integration}`);
    } catch (err) {
      adapter.log.error("Failed to uninstall MCP for global Codex CLI", err);
    }
  }
}
async function installMCP(config) {
  const { integration, adapter } = config;
  const installationPath = adapter.getInstallationPath();
  const configFilePath = getConfigPathForIntegration(adapter, integration);
  const mcpConfiguration = (0, import_util.getMcpConfiguration)({
    folderPath: installationPath,
    appName: adapter.getAppName(),
    agentName: integration
  });
  const configExists = fs.existsSync(configFilePath);
  if (!configExists) {
    fs.mkdirSync(path.dirname(configFilePath), {
      recursive: true
    });
  }
  let content = "{}";
  if (configExists) {
    content = fs.readFileSync(configFilePath, "utf-8");
  } else if (integration === "codexCLI") {
    content = "";
  }
  let toWrite;
  let mcpServersKey = "mcpServers";
  if (integration === "codexCLI") {
    toWrite = toml.parse(content);
    mcpServersKey = "mcp_servers";
  } else {
    if (content.trim() === "") {
      content = "{}";
    }
    toWrite = JSON.parse(content);
  }
  if (integration === "openCodeCLI") {
    mcpServersKey = "mcp";
  } else if (integration === "copilotIDE") {
    mcpServersKey = "servers";
  }
  if (!toWrite[mcpServersKey]) {
    toWrite[mcpServersKey] = {};
  }
  const existing = toWrite[mcpServersKey][PENCIL_MCP_NAME] || {};
  toWrite[mcpServersKey][PENCIL_MCP_NAME] = {
    ...existing,
    ...mcpConfiguration
  };
  if (integration === "codexCLI" || integration === "openCodeCLI") {
    delete toWrite[mcpServersKey][PENCIL_MCP_NAME].env;
  }
  if (integration === "claudeCodeCLI" || integration === "copilotIDE" || integration === "claudeDesktop") {
    toWrite[mcpServersKey][PENCIL_MCP_NAME].type = "stdio";
  }
  if (integration === "openCodeCLI") {
    toWrite[mcpServersKey][PENCIL_MCP_NAME].enabled = true;
    toWrite[mcpServersKey][PENCIL_MCP_NAME].type = "local";
    toWrite[mcpServersKey][PENCIL_MCP_NAME].command = [
      toWrite[mcpServersKey][PENCIL_MCP_NAME].command,
      ...toWrite[mcpServersKey][PENCIL_MCP_NAME].args
    ];
    delete toWrite[mcpServersKey][PENCIL_MCP_NAME].args;
  }
  if ([
    "codexCLI",
    "claudeCodeCLI",
    "geminiCLI",
    "antigravityIDE",
    "antigravity",
    "openCodeCLI",
    "copilotIDE",
    "kiroCLI",
    "claudeDesktop"
  ].includes(integration)) {
    delete toWrite[mcpServersKey][PENCIL_MCP_NAME].name;
    delete toWrite[mcpServersKey][PENCIL_MCP_NAME].transport;
  }
  if (integration === "codexCLI") {
    toWrite = toml.stringify(toWrite);
  } else {
    toWrite = JSON.stringify(toWrite, null, 2);
  }
  fs.writeFileSync(configFilePath, toWrite);
  if (integration === "claudeCodeCLI") {
    await allowMCPToolInClaudeCode(adapter);
  }
}
async function allowMCPToolInClaudeCode(adapter) {
  const allowRule = `mcp__${PENCIL_MCP_NAME}`;
  const claudeCodeSettingsPath = path.join(
    os.homedir(),
    ".claude",
    "settings.json"
  );
  try {
    let obj = {};
    if (fs.existsSync(claudeCodeSettingsPath)) {
      let objStr = fs.readFileSync(claudeCodeSettingsPath, "utf-8");
      if (objStr.trim() === "") {
        objStr = "{}";
      }
      obj = JSON.parse(objStr);
    } else {
      fs.mkdirSync(path.dirname(claudeCodeSettingsPath), { recursive: true });
    }
    if (!obj.permissions) {
      obj.permissions = {};
    }
    if (!obj.permissions.allow) {
      obj.permissions.allow = [];
    }
    if (!obj.permissions.allow.includes(allowRule)) {
      obj.permissions.allow.push(allowRule);
      fs.writeFileSync(claudeCodeSettingsPath, JSON.stringify(obj, null, 2));
    }
    return true;
  } catch (err) {
    adapter.log.warn("Failed to setup allow rules for claudeCodeCLI", err);
  }
  return false;
}
async function removeMCP(config) {
  const { adapter, integration } = config;
  const configFilePath = getConfigPathForIntegration(adapter, integration);
  try {
    if (!fs.existsSync(configFilePath)) {
      return false;
    }
    let content = fs.readFileSync(configFilePath, "utf-8");
    let toWrite;
    let mcpServersKey = "mcpServers";
    let removed = false;
    if (config.integration === "codexCLI") {
      toWrite = toml.parse(content);
      mcpServersKey = "mcp_servers";
    } else {
      if (content.trim() === "") {
        content = "{}";
      }
      toWrite = JSON.parse(content);
    }
    if (config.integration === "openCodeCLI") {
      mcpServersKey = "mcp";
    }
    if (toWrite[mcpServersKey]?.[PENCIL_MCP_NAME]) {
      delete toWrite[mcpServersKey][PENCIL_MCP_NAME];
      if (config.integration === "codexCLI") {
        toWrite = toml.stringify(toWrite);
      } else {
        toWrite = JSON.stringify(toWrite, null, 2);
      }
      removed = true;
    }
    if (removed) {
      fs.writeFileSync(configFilePath, toWrite);
      if (integration === "claudeCodeCLI") {
        await removeAllowRulesFromClaudeCode(adapter);
      }
      return true;
    }
    return false;
  } catch (err) {
    config.adapter.log.warn(
      `Failed to remove MCP server from ${configFilePath}`,
      err
    );
    return false;
  }
}
async function removeAllowRulesFromClaudeCode(adapter) {
  const allowRule = `mcp__${PENCIL_MCP_NAME}`;
  const claudeCodeSettingsPath = path.join(
    os.homedir(),
    ".claude",
    "settings.json"
  );
  try {
    if (!fs.existsSync(claudeCodeSettingsPath)) {
      return false;
    }
    let objStr = fs.readFileSync(claudeCodeSettingsPath, "utf-8");
    if (objStr.trim() === "") {
      objStr = "{}";
    }
    const obj = JSON.parse(objStr);
    if (obj.permissions?.allow) {
      const index = obj.permissions.allow.indexOf(allowRule);
      if (index > -1) {
        obj.permissions.allow.splice(index, 1);
        fs.writeFileSync(claudeCodeSettingsPath, JSON.stringify(obj, null, 2));
        adapter.log.info("Removed MCP allow rules from claudeCodeCLI");
        return true;
      }
    }
    return false;
  } catch (err) {
    adapter.log.warn("Failed to remove allow rules from claudeCodeCLI", err);
    return false;
  }
}
function getConfigPathForIntegration(adapter, integration) {
  if (integration === "claudeDesktop") {
    if (os.platform() === "win32") {
      return path.join(adapter.getAppPath(), MCP_CONFIG_MAP[integration]);
    } else {
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        MCP_CONFIG_MAP[integration]
      );
    }
  }
  return path.join(
    integration === "copilotIDE" ? adapter.getAppPath() : os.homedir(),
    MCP_CONFIG_MAP[integration]
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activateIntegrations,
  removeIntegrations
});
//# sourceMappingURL=installer.js.map
