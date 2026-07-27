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

const BINARY = 'opencode';
const RULES_DIR = path.join(os.homedir(), '.config', 'opencode', 'rules');

async function whichOpenCode(): Promise<{ path: string; version: string } | null> {
  try {
    const { stdout } = await execFileAsync('which', [BINARY]);
    const binaryPath = stdout.trim();
    if (!binaryPath) return null;
    const { stdout: versionOut } = await execFileAsync(binaryPath, ['--version']);
    return { path: binaryPath, version: versionOut.trim() };
  } catch {
    return null;
  }
}

export const opencodeAdapter: PlatformAdapter = {
  async detect() {
    const found = await whichOpenCode();
    if (!found) return { installed: false };
    return { installed: true, version: found.version, path: found.path };
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
    const stagingDir = path.join(os.homedir(), '.config', 'opencode', 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const stagingDir = path.join(os.homedir(), '.config', 'opencode', 'staging');
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    if (fs.existsSync(capsuleFile)) {
      const activeDir = path.join(os.homedir(), '.config', 'opencode');
      const dest = path.join(activeDir, 'active-capsule.json');
      fs.copyFileSync(capsuleFile, dest);
      fs.rmSync(capsuleFile);
    }
    return { ok: true };
  },

  async probe() {
    try {
      const { stdout } = await execFileAsync(BINARY, ['--version']);
      return { ok: true, detail: `opencode ${stdout.trim()}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `opencode unreachable: ${message}` };
    }
  },

  async update() {
    try {
      await execFileAsync(BINARY, ['upgrade']);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },

  async uninstall() {
    try {
      await execFileAsync(BINARY, ['uninstall']);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },

  async rollback(version: string) {
    try {
      await execFileAsync(BINARY, ['upgrade', version]);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
};
