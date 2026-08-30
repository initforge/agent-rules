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

const BINARY = 'grok';
const GROK_HOME = path.join(os.homedir(), '.grok');
const RULES_DIR = path.join(GROK_HOME, 'rules');

async function whichGrok(): Promise<{ path: string; version?: string } | null> {
  const isWin = process.platform === 'win32';
  const lookupCmd = isWin ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(lookupCmd, [BINARY]);
    const binaryPath = stdout.split(/\r?\n/)[0]?.trim();
    if (!binaryPath) return null;
    let version: string | undefined;
    const versionFile = path.join(GROK_HOME, 'version.json');
    if (fs.existsSync(versionFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
        version = data.version;
      } catch { /* ignore */ }
    }
    return { path: binaryPath, version };
  } catch {
    return null;
  }
}

export const grokAdapter: PlatformAdapter = {
  async detect() {
    const found = await whichGrok();
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
    const stagingDir = path.join(GROK_HOME, 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const stagingDir = path.join(GROK_HOME, 'staging');
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    if (fs.existsSync(capsuleFile)) {
      const dest = path.join(GROK_HOME, 'active-capsule.json');
      fs.copyFileSync(capsuleFile, dest);
      fs.rmSync(capsuleFile);
    }
    return { ok: true };
  },

  async probe() {
    try {
      const { stdout } = await execFileAsync(BINARY, ['--version']);
      return { ok: true, detail: `grok ${stdout.trim()}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `grok unreachable: ${message}` };
    }
  },

  async probePlanning(): Promise<{ supported: boolean; mode: string; reason?: string }> {
    const isWin = process.platform === 'win32';
    const probe = isWin ? 'where' : 'which';
    try {
      await execFileAsync(probe, [BINARY]);
      return { supported: true, mode: 'grok-plan-mode' };
    } catch {
      return { supported: false, mode: 'grok-plan-mode', reason: 'grok executable is not found on PATH' };
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
