import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureCommandCodeBackup,
  commandCodeMcpPath,
  commandCodeModPath,
  installCommandCodeMod,
  readCommandCodeNative,
  restoreCommandCodeBackup,
  verifyCommandCodeBackup,
  writeCommandCodeMcpConfig,
} from "../src/services/command-code-native.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "command-code-native-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Command Code native projection", () => {
  it("writes the managed mod and all standard MCP servers under .commandcode", () => {
    const home = path.join(tempRoot(), ".commandcode");
    installCommandCodeMod(home, process.cwd());
    writeCommandCodeMcpConfig(home);

    const readback = readCommandCodeNative(home);
    expect(readback.modManaged).toBe(true);
    expect(readback.mcpComplete).toBe(true);
    expect(readback.mcpServerNames).toEqual(["chrome-devtools", "codebase-memory", "context7", "playwright"]);

    const config = JSON.parse(fs.readFileSync(commandCodeMcpPath(home), "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
    expect(config.mcpServers.playwright.command).toBe("cmd.exe");
    expect(config.mcpServers.playwright.args).toContain("@playwright/mcp@0.0.78");
  });

  it("refuses to overwrite a user-owned same-name MCP server or mod", () => {
    const home = path.join(tempRoot(), ".commandcode");
    fs.mkdirSync(path.dirname(commandCodeMcpPath(home)), { recursive: true });
    fs.writeFileSync(commandCodeMcpPath(home), JSON.stringify({ mcpServers: { context7: { command: "user-command", args: [] } } }));
    expect(() => writeCommandCodeMcpConfig(home)).toThrow(/user-modified/);

    fs.mkdirSync(path.dirname(commandCodeModPath(home)), { recursive: true });
    fs.writeFileSync(commandCodeModPath(home), "export default () => undefined;\n");
    expect(() => installCommandCodeMod(home, process.cwd())).toThrow(/user-owned/);
  });

  it("restores the Command Code MCP/mod transaction byte-for-byte", () => {
    const root = tempRoot();
    const home = path.join(root, ".commandcode");
    installCommandCodeMod(home, process.cwd());
    writeCommandCodeMcpConfig(home);
    const backup = path.join(root, "backup");
    captureCommandCodeBackup(home, backup);

    fs.writeFileSync(commandCodeModPath(home), "changed\n");
    fs.writeFileSync(commandCodeMcpPath(home), "{}\n");
    restoreCommandCodeBackup(backup);

    expect(verifyCommandCodeBackup(backup)).toBe(true);
    expect(readCommandCodeNative(home).modManaged).toBe(true);
    expect(readCommandCodeNative(home).mcpComplete).toBe(true);
  });
});
