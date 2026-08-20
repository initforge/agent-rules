import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * MiMoCode platform adapter.
 *
 * MiMoCode (binary: mimo) is an AI coding agent by Xiaomi MiMo Team.
 * Unlike Claude/Codex which use monolithic context files (CLAUDE.md/AGENTS.md),
 * MiMoCode uses a plugin/skill-based architecture with:
 * - Config: ~/.config/mimocode/mimocode.jsonc
 * - Data: ~/.local/share/mimocode/
 * - Project config/resources: .mimocode/ directory at project root
 * - Skills are materialized by the agent-rules build/install path; do not hard-code repository-absolute skill paths
 */

const BINARY = 'mimo';

function getConfigHome(): string {
  const home = process.env.MIMOCODE_HOME;
  return process.env.MIMOCODE_CONFIG_DIR || (home ? path.join(home, 'config') : path.join(os.homedir(), '.config', 'mimocode'));
}

function getDataHome(): string {
  const home = process.env.MIMOCODE_HOME;
  return process.env.MIMOCODE_DATA_DIR || (home ? path.join(home, 'data') : path.join(os.homedir(), '.local', 'share', 'mimocode'));
}

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

export class MiMoCodeAdapter implements PlatformAdapter {
  async detect(): Promise<{ installed: boolean; version?: string; path?: string }> {
    try {
      const { stdout } = await execFileAsync(BINARY, ['--version']);
      const version = stdout.trim().split('\n')[0];
      const { stdout: whichOut } = await execFileAsync('which', [BINARY]).catch(() => ({ stdout: '' }));
      return { installed: true, version, path: whichOut.trim() || undefined };
    } catch {
      return { installed: false };
    }
  }

  async render(context: unknown): Promise<string> {
    const configHome = getConfigHome();
    const contextDir = path.join(configHome, 'context');
    fs.mkdirSync(contextDir, { recursive: true });

    const contextPath = path.join(contextDir, 'agent-rules-context.md');
    const content = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    fs.writeFileSync(contextPath, content, 'utf8');
    return contextPath;
  }

  async stage(context: unknown): Promise<string> {
    const configHome = getConfigHome();
    const stagingDir = path.join(configHome, 'staging');
    fs.mkdirSync(stagingDir, { recursive: true });

    const capsulePath = path.join(stagingDir, 'activation-capsule.json');
    const content = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    fs.writeFileSync(capsulePath, content, 'utf8');
    return capsulePath;
  }

  async activate(): Promise<{ ok: boolean }> {
    const configHome = getConfigHome();
    const stagingDir = path.join(configHome, 'staging');
    const activePath = path.join(configHome, 'active-capsule.json');
    const stagedPath = path.join(stagingDir, 'activation-capsule.json');

    if (!fs.existsSync(stagedPath)) {
      return { ok: false };
    }

    try {
      fs.copyFileSync(stagedPath, activePath);
      fs.unlinkSync(stagedPath);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async probe(): Promise<{ ok: boolean; detail: string }> {
    try {
      const { stdout } = await execFileAsync(BINARY, ['--version']);
      return { ok: true, detail: stdout.trim() };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  async update(): Promise<{ ok: boolean }> {
    // Official package is @mimo-ai/cli. Keep argv exact; never invoke a shell.
    try {
      await execFileAsync('npm', ['update', '-g', '@mimo-ai/cli']);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async uninstall(): Promise<{ ok: boolean }> {
    try {
      const configHome = getConfigHome();
      const contextDir = path.join(configHome, 'context');
      const stagingDir = path.join(configHome, 'staging');
      const activePath = path.join(configHome, 'active-capsule.json');

      if (fs.existsSync(contextDir)) fs.rmSync(contextDir, { recursive: true, force: true });
      if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
      if (fs.existsSync(activePath)) fs.unlinkSync(activePath);

      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async rollback(_version: string): Promise<{ ok: boolean }> {
    // MiMoCode rollback is a no-op — context files are simple markdown
    return { ok: true };
  }
}
