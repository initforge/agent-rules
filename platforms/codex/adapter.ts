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

const CODEX_HOME = path.join(os.homedir(), '.codex');
const RULES_DIR = path.join(CODEX_HOME, 'rules');
const CODEX_BINARY = 'codex';

export const codexAdapter: PlatformAdapter = {
  async detect() {
    const homeExists = fs.existsSync(CODEX_HOME);
    if (!homeExists) return { installed: false };

    try {
      const { stdout } = await execFileAsync('which', [CODEX_BINARY]);
      const binaryPath = stdout.trim();
      if (binaryPath) {
        return { installed: true, path: binaryPath, version: 'desktop' };
      }
    } catch {
      // binary not on PATH — desktop install is still valid
    }

    return { installed: true, version: 'desktop', path: CODEX_HOME };
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
    const stagingDir = path.join(CODEX_HOME, 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const stagingDir = path.join(CODEX_HOME, 'staging');
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    if (fs.existsSync(capsuleFile)) {
      const dest = path.join(CODEX_HOME, 'active-capsule.json');
      fs.copyFileSync(capsuleFile, dest);
      fs.rmSync(capsuleFile);
    }
    return { ok: true };
  },

  async probe() {
    const homeExists = fs.existsSync(CODEX_HOME);
    if (!homeExists) {
      return { ok: false, detail: 'Codex home directory not found' };
    }
    const configOk = fs.existsSync(path.join(CODEX_HOME, 'config.toml'));
    return {
      ok: configOk,
      detail: configOk
        ? 'Codex Desktop config.toml present'
        : 'Codex Desktop missing config.toml',
    };
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
