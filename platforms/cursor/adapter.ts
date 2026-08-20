import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PlatformAdapter {
  detect(): Promise<{ installed: boolean; version?: string; path?: string }>;
  render(context: unknown): Promise<string>;
  stage(context: unknown): Promise<string>;
  activate(): Promise<{ ok: boolean }>;
  probe(): Promise<{ ok: boolean; detail: string }>;
  update(): Promise<{ ok: boolean }>;
  uninstall(): Promise<{ ok: boolean }>;
  rollback(version: string): Promise<{ ok: boolean }>;
}

const BINARY = 'cursor';
const CURSOR_HOME = path.join(os.homedir(), '.cursor');
const RULES_DIR = path.join(CURSOR_HOME, 'rules');

async function whichCursor(): Promise<{ path: string; version?: string } | null> {
  try {
    const { stdout } = await execFileAsync('which', [BINARY]);
    const binaryPath = stdout.trim();
    if (!binaryPath) return null;
    let version: string | undefined;
    try {
      const { stdout: versionOut } = await execFileAsync(binaryPath, ['--version']);
      version = versionOut.trim();
    } catch { /* ignore */ }
    return { path: binaryPath, version };
  } catch {
    return null;
  }
}

export const cursorAdapter: PlatformAdapter = {
  async detect() {
    const found = await whichCursor();
    if (found) {
      return { installed: true, version: found.version, path: found.path };
    }
    const homeExists = fs.existsSync(CURSOR_HOME);
    if (homeExists) {
      return { installed: true, version: 'desktop', path: CURSOR_HOME };
    }
    return { installed: false };
  },

  async render(context: unknown) {
    if (!fs.existsSync(RULES_DIR)) {
      fs.mkdirSync(RULES_DIR, { recursive: true });
    }
    const ruleFile = path.join(RULES_DIR, 'agent-rules-context.md');
    const content = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    fs.writeFileSync(ruleFile, content, 'utf-8');
    return ruleFile;
  },

  async stage(context: unknown) {
    const stagingDir = path.join(CURSOR_HOME, 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const stagingDir = path.join(CURSOR_HOME, 'staging');
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    if (fs.existsSync(capsuleFile)) {
      const dest = path.join(CURSOR_HOME, 'active-capsule.json');
      fs.copyFileSync(capsuleFile, dest);
      fs.rmSync(capsuleFile);
    }
    return { ok: true };
  },

  async probe() {
    try {
      const { stdout } = await execFileAsync(BINARY, ['--version']);
      return { ok: true, detail: `cursor ${stdout.trim()}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `cursor unreachable: ${message}` };
    }
  },

  async update() {
    return { ok: false };
  },

  async uninstall() {
    return { ok: false };
  },

  async rollback(_version: string) {
    return { ok: false };
  },
};
