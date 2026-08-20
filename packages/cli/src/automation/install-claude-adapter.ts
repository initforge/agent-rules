import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface InstallClaudeAdapterOptions {
  repoRoot: string;
  claudeHome?: string;
  whatIf?: boolean;
}

interface OwnershipManifest {
  files: string[];
}

export async function installClaudeAdapter(options: InstallClaudeAdapterOptions): Promise<{ ok: boolean; message: string }> {
  const { repoRoot, whatIf = false } = options;
  const claudeHome = options.claudeHome ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");

  const ownedFileName = "agent-rules-owned.json";
  const backupDirName = "agent-rules-backups";
  const buildHome = path.join(repoRoot, "generated/runtime-build/claude");
  const ownershipManifest = path.join(claudeHome, ownedFileName);
  const backupDir = path.join(claudeHome, backupDirName);

  // Check build home exists
  if (!(await dirExists(buildHome))) {
    return { ok: false, message: `Build home not found: ${buildHome}` };
  }

  // Read ownership manifest
  let ownedFiles: string[] = [];
  try {
    const manifest = JSON.parse(await fs.readFile(ownershipManifest, "utf8"));
    ownedFiles = manifest.files ?? [];
  } catch {
    // No existing manifest
  }

  // Backup existing files
  for (const file of ownedFiles) {
    const targetPath = path.join(claudeHome, file);
    if (await fileExists(targetPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
      const backupPath = path.join(backupDir, `${timestamp}-${file.replace(/\//g, "-")}.backup`);
      if (whatIf) {
        console.log(`[WhatIf] Would backup ${file} -> ${backupPath}`);
      } else {
        await fs.mkdir(backupDir, { recursive: true });
        await fs.copyFile(targetPath, backupPath);
        console.log(`Backed up ${file} -> ${backupPath}`);
      }
    }
  }

  // Copy files from build home
  const newOwnedFiles: string[] = [];
  const buildFiles = await listFiles(buildHome);
  for (const file of buildFiles) {
    const srcPath = path.join(buildHome, file);
    const destPath = path.join(claudeHome, file);
    if (whatIf) {
      console.log(`[WhatIf] Would copy ${file} -> ${destPath}`);
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      console.log(`Copied ${file}`);
    }
    newOwnedFiles.push(file);
  }

  // Write ownership manifest
  const manifest: OwnershipManifest = { files: newOwnedFiles };
  if (whatIf) {
    console.log(`[WhatIf] Would write ownership manifest: ${ownershipManifest}`);
  } else {
    await fs.mkdir(path.dirname(ownershipManifest), { recursive: true });
    await fs.writeFile(ownershipManifest, JSON.stringify(manifest, null, 2), "utf8");
    console.log(`Updated ownership manifest: ${ownershipManifest}`);
  }

  return { ok: true, message: `Claude adapter installed to ${claudeHome}` };
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(full, relative)));
    } else if (entry.name !== "manifest.json") {
      results.push(relative);
    }
  }
  return results;
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
