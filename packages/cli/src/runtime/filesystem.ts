import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export function hash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function exists(filePath: string): Promise<boolean> {
  try { await fs.lstat(filePath); return true; }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function assertDirectoryNotLinked(directory: string): Promise<void> {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing linked or non-directory path: ${directory}`);
}

export async function readRegularFileNoFollow(filePath: string): Promise<Buffer> {
  const before = await fs.lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`Refusing linked or non-regular file: ${filePath}`);
  let handle: fs.FileHandle | undefined;
  try {
    const flags = process.platform === "win32" ? fsConstants.O_RDONLY : fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
    handle = await fs.open(filePath, flags);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error(`File changed while opening: ${filePath}`);
    const body = await handle.readFile();
    const after = await fs.lstat(filePath);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== opened.dev || after.ino !== opened.ino) throw new Error(`File changed while reading: ${filePath}`);
    return body;
  } finally { await handle?.close(); }
}

export async function fsyncRegularFile(filePath: string, platform = process.platform): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, platform === "win32" ? "r+" : "r");
    await handle.sync();
  } finally { await handle?.close(); }
}

export async function fsyncDirectory(directory: string): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch (error: unknown) {
    if (!["EACCES", "EBADF", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  } finally { await handle?.close(); }
}

export async function writeJsonDurable(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fsyncRegularFile(tempPath);
  await fs.rename(tempPath, filePath);
  await fsyncDirectory(path.dirname(filePath));
}

export async function removeIfExists(filePath: string): Promise<void> {
  await fs.rm(filePath, { recursive: true, force: true, maxRetries: 2 });
}
