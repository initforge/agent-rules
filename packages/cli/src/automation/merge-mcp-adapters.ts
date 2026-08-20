import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

function getCodebaseMcpBin(): string | null {
  const platform = process.platform;
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const winPath = path.join(localAppData, "Programs", "codebase-memory-mcp", "codebase-memory-mcp.exe");
      try {
        require("node:fs").accessSync(winPath);
        return winPath;
      } catch {}
    }
  } else if (platform === "darwin") {
    const darwinPath = path.join(os.homedir(), "Library", "Application Support", "codebase-memory-mcp", "codebase-memory-mcp");
    try {
      require("node:fs").accessSync(darwinPath);
      return darwinPath;
    } catch {}
  } else {
    const linuxPath = path.join(os.homedir(), ".local", "share", "codebase-memory-mcp", "codebase-memory-mcp");
    try {
      require("node:fs").accessSync(linuxPath);
      return linuxPath;
    } catch {}
  }
  return null;
}

function pencilLauncherForAdapter(adapterPath: string): string {
  // Adapters live in `<integration>/adapters`; keep the launcher beside the
  // host-managed integration so installed host configs never contain a stale
  // repo-relative placeholder.
  const launcher = path.resolve(path.dirname(adapterPath), "..", "launch.mjs");
  return process.platform === "win32" ? launcher.replaceAll("\\", "/") : launcher;
}

function expandMcpPlaceholders(text: string, adapterPath: string): string {
  const bin = getCodebaseMcpBin();
  let expanded = text;
  if (bin) {
    const safeBin = bin.replace(/\\/g, "/");
    expanded = expanded.replaceAll("${CODEBASE_MEMORY_MCP_BIN}", safeBin);
  }
  return expanded.replaceAll("__AGENT_RULES_PENCIL_LAUNCHER__", pencilLauncherForAdapter(adapterPath));
}

export async function mergeJsonMcpAdapters(configPath: string, adapterPaths: string[]): Promise<boolean> {
  if (adapterPaths.length === 0) return false;

  const merged: Record<string, Record<string, unknown>> = { mcpServers: {} };

  if (await fileExists(configPath)) {
    const existing = JSON.parse(await fs.readFile(configPath, "utf8"));
    if (existing.mcpServers) {
      for (const [key, value] of Object.entries(existing.mcpServers)) {
        merged.mcpServers[key] = value;
      }
    }
  }

  let changed = false;
  for (const adapterPath of adapterPaths) {
    if (!(await fileExists(adapterPath))) continue;
    const raw = expandMcpPlaceholders(await fs.readFile(adapterPath, "utf8"), adapterPath);
    const adapter = JSON.parse(raw);
    if (!adapter.mcpServers) continue;
    for (const [key, value] of Object.entries(adapter.mcpServers)) {
      merged.mcpServers[key] = value;
      changed = true;
    }
  }

  if (!changed) return false;

  const parent = path.dirname(configPath);
  await fs.mkdir(parent, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(merged, null, 2), "utf8");
  return true;
}

export async function mergeCodexTomlAdapters(configPath: string, adapterPaths: string[]): Promise<boolean> {
  if (adapterPaths.length === 0) return false;

  let content = "";
  try {
    content = await fs.readFile(configPath, "utf8");
  } catch {
    // File doesn't exist yet
  }

  let changed = false;

  for (const adapterPath of adapterPaths) {
    if (!(await fileExists(adapterPath))) continue;
    const block = expandMcpPlaceholders((await fs.readFile(adapterPath, "utf8")).trim(), adapterPath);

    const sectionMatch = block.match(/\[mcp_servers\.([^\]]+)\]/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1];
      const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?ms)^\\s*\\[mcp_servers\\.${escapedSection}\\]\\s*\\r?\\n.*?(?=^\\s*\\[[A-Za-z_][A-Za-z0-9_.-]*\\]\\s*$|\\z)`);

      if (pattern.test(content)) {
        content = content.replace(pattern, block + "\n");
      } else {
        content = (content.trimEnd() + "\n\n# agent-rules\n" + block + "\n");
      }
      changed = true;
    }
  }

  if (!changed) return false;

  const parent = path.dirname(configPath);
  await fs.mkdir(parent, { recursive: true });
  await fs.writeFile(configPath, content, "utf8");
  return true;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
