import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface InstallOpenCodeAdapterOptions {
  repoRoot: string;
  global?: boolean;
  projectRoot?: string;
  whatIf?: boolean;
}

interface OwnedFile {
  source: string;
  targetRelative: string;
}

export async function installOpenCodeAdapter(options: InstallOpenCodeAdapterOptions): Promise<{ ok: boolean; message: string }> {
  const { repoRoot, global: isGlobal = false, whatIf = false } = options;
  const projectRoot = options.projectRoot ?? process.env.INITFORGE_PROJECT_ROOT ?? process.cwd();

  const ownedFileName = "agent-rules-owned.json";
  const backupDirName = "agent-rules-backups";

  // Resolve target home
  const targetHome = isGlobal
    ? path.join(os.homedir(), ".config", "opencode")
    : path.join(projectRoot, ".opencode");

  const agentDir = path.join(targetHome, "agents");
  const ownershipManifest = path.join(targetHome, ownedFileName);
  const backupDir = path.join(targetHome, backupDirName);
  const sourceAgents = path.join(repoRoot, "platforms/opencode/agents");

  // Collect owned files
  const ownedFiles: OwnedFile[] = [];
  if (await dirExists(sourceAgents)) {
    const entries = await fs.readdir(sourceAgents, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        ownedFiles.push({
          source: path.join(sourceAgents, entry.name),
          targetRelative: `agents/${entry.name}`,
        });
      }
    }
  }

  // Read existing ownership manifest
  let existingOwned: string[] = [];
  try {
    existingOwned = JSON.parse(await fs.readFile(ownershipManifest, "utf8"));
  } catch {
    // No existing manifest
  }

  // Backup files that will be overwritten
  for (const file of ownedFiles) {
    const targetPath = path.join(targetHome, file.targetRelative);
    if (await fileExists(targetPath) && existingOwned.includes(file.targetRelative)) {
      const backupPath = path.join(backupDir, `${file.targetRelative.replace(/\//g, "-")}.backup`);
      if (whatIf) {
        console.log(`[WhatIf] Would backup ${file.targetRelative} -> ${backupPath}`);
      } else {
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.copyFile(targetPath, backupPath);
        console.log(`Backed up ${file.targetRelative}`);
      }
    }
  }

  // Copy files
  for (const file of ownedFiles) {
    const destPath = path.join(targetHome, file.targetRelative);
    if (whatIf) {
      console.log(`[WhatIf] Would copy ${path.basename(file.source)} -> ${destPath}`);
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(file.source, destPath);
      console.log(`Copied ${file.targetRelative}`);
    }
  }

  // Write ownership manifest
  const manifest = ownedFiles.map((f) => f.targetRelative);
  if (whatIf) {
    console.log(`[WhatIf] Would write ownership manifest: ${ownershipManifest}`);
  } else {
    await fs.mkdir(path.dirname(ownershipManifest), { recursive: true });
    await fs.writeFile(ownershipManifest, JSON.stringify(manifest, null, 2), "utf8");
    console.log(`Updated ownership manifest: ${ownershipManifest}`);
  }

  return { ok: true, message: `OpenCode adapter installed to ${targetHome}` };
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
