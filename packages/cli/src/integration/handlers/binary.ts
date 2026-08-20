import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { detectPlatform, expandInstallDir, type PlatformInfo } from "../platform-detect.js";

const execFileAsync = promisify(execFile);

export interface BinaryManifest {
  name: string;
  upstream: string;
  version: string;
  installDirs: Record<string, string>;
  assets: Record<string, { archive: string; sha256: string }>;
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function binaryName(manifest: BinaryManifest, info: PlatformInfo): string {
  return info.platform === "windows" ? `${manifest.name}.exe` : manifest.name;
}

function installRoot(manifest: BinaryManifest, info: PlatformInfo): string {
  const template = manifest.installDirs[info.platform] ?? manifest.installDirs.linux;
  return expandInstallDir(template, info.home);
}

export async function binaryInstall(manifestPath: string): Promise<{ ok: boolean; message: string }> {
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest: BinaryManifest = JSON.parse(raw);
  const info = detectPlatform();
  const asset = manifest.assets[info.key];
  if (!asset) return { ok: false, message: `Unsupported platform: ${info.key}` };

  const root = installRoot(manifest, info);
  const binary = binaryName(manifest, info);
  const target = path.join(root, binary);

  if (await fs.stat(target).then(() => true).catch(() => false)) {
    return { ok: true, message: `Already installed: ${target}` };
  }

  const tmpDir = os.tmpdir();
  const url = `${manifest.upstream}/releases/download/v${manifest.version}/${asset.archive}`;
  const archivePath = path.join(tmpDir, asset.archive);
  const extractDir = path.join(tmpDir, `${manifest.name}-${manifest.version}-${info.key}`);

  try {
    await execFileAsync("curl", ["-fsSL", "-o", archivePath, url], { timeout: 120_000 });
    const downloaded = await fs.readFile(archivePath);
    const actual = sha256(downloaded);
    if (actual !== asset.sha256) {
      return { ok: false, message: `Checksum mismatch: expected ${asset.sha256}, got ${actual}` };
    }

    await fs.rm(extractDir, { recursive: true, force: true });
    await fs.mkdir(extractDir, { recursive: true });

    if (asset.archive.endsWith(".zip")) {
      await execFileAsync("unzip", ["-o", archivePath, "-d", extractDir], { timeout: 60_000 });
    } else {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir], { timeout: 60_000 });
    }

    const extractedFiles = await listFiles(extractDir);
    const found = extractedFiles.find((f) => path.basename(f) === binary);
    if (!found) return { ok: false, message: `Binary not found in archive: ${binary}` };

    await fs.mkdir(root, { recursive: true });
    await fs.copyFile(found, target);
    if (info.platform !== "windows") {
      await fs.chmod(target, 0o755);
    }

    await fs.rm(archivePath, { force: true });
    await fs.rm(extractDir, { recursive: true, force: true });

    return { ok: true, message: `Installed: ${target}` };
  } catch (error) {
    await fs.rm(archivePath, { force: true });
    await fs.rm(extractDir, { recursive: true, force: true });
    return { ok: false, message: `Install failed: ${(error as Error).message}` };
  }
}

export async function binaryVerify(manifestPath: string): Promise<{ ok: boolean; message: string }> {
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest: BinaryManifest = JSON.parse(raw);
  const info = detectPlatform();
  const root = installRoot(manifest, info);
  const binary = binaryName(manifest, info);
  const target = path.join(root, binary);

  if (!(await fs.stat(target).then(() => true).catch(() => false))) {
    return { ok: false, message: `Missing binary: ${target}` };
  }

  try {
    const { stdout } = await execFileAsync(target, ["--version"], { timeout: 10_000 });
    return { ok: true, message: `${manifest.name} PASS: ${stdout.trim()}` };
  } catch (error) {
    return { ok: false, message: `${manifest.name} verify failed: ${(error as Error).message}` };
  }
}

export async function binaryUninstall(manifestPath: string): Promise<{ ok: boolean; message: string }> {
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest: BinaryManifest = JSON.parse(raw);
  const info = detectPlatform();
  const root = installRoot(manifest, info);

  if (!(await fs.stat(root).then(() => true).catch(() => false))) {
    return { ok: true, message: `Not installed: ${root}` };
  }

  try {
    await fs.rm(root, { recursive: true, force: true });
    return { ok: true, message: `Uninstalled: ${root}` };
  } catch (error) {
    return { ok: false, message: `Uninstall failed: ${(error as Error).message}` };
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(full)));
    } else {
      results.push(full);
    }
  }
  return results;
}
