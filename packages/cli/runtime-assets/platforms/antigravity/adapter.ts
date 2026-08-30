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

const BINARIES = ['gemini', 'agy'];
const ANTIGRAVITY_HOME = process.env.ANTIGRAVITY_HOME || path.join(os.homedir(), '.gemini', 'config');
const RULES_DIR = path.join(ANTIGRAVITY_HOME, 'rules');

export interface AntigravityAdapter extends PlatformAdapter {
  inspectSkills(repoRoot?: string): Promise<{ skills: string[]; locations: string[] }>;
  probePlanning(): Promise<{ supported: boolean; mode: string; reason?: string }>;
}

async function whichAntigravity(): Promise<{ path: string; version?: string } | null> {
  const isWin = process.platform === 'win32';
  for (const binary of BINARIES) {
    try {
      const probe = isWin ? 'where' : 'which';
      const { stdout } = await execFileAsync(probe, [binary]);
      const binaryPath = stdout.trim().split(/\r?\n/)[0]?.trim();
      if (!binaryPath) continue;
      let version: string | undefined;
      try {
        const { stdout: versionOut } = await execFileAsync(binaryPath, ['--version']);
        version = versionOut.trim();
      } catch { /* ignore */ }
      return { path: binaryPath, version };
    } catch {
      continue;
    }
  }
  // Windows: agy-node.cmd via Antigravity's Roaming bin
  if (isWin) {
    const agyNode = path.join(os.homedir(), 'AppData', 'Roaming', 'antigravity', 'bin', 'agy-node.cmd');
    if (fs.existsSync(agyNode)) {
      return { path: agyNode, version: '2.8.1' };
    }
  }
  return null;
}

export const antigravityAdapter: AntigravityAdapter = {
  async detect() {
    const found = await whichAntigravity();
    if (found) {
      return { installed: true, version: found.version, path: found.path };
    }
    const homeExists = fs.existsSync(ANTIGRAVITY_HOME);
    if (homeExists) {
      return { installed: true, version: 'desktop', path: ANTIGRAVITY_HOME };
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
    const stagingDir = path.join(ANTIGRAVITY_HOME, 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const stagingDir = path.join(ANTIGRAVITY_HOME, 'staging');
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    if (fs.existsSync(capsuleFile)) {
      const dest = path.join(ANTIGRAVITY_HOME, 'active-capsule.json');
      fs.copyFileSync(capsuleFile, dest);
      fs.rmSync(capsuleFile);
    }
    return { ok: true };
  },

  async probe() {
    const isWin = process.platform === 'win32';
    for (const binary of BINARIES) {
      try {
        const { stdout } = await execFileAsync(binary, ['--version']);
        return { ok: true, detail: `${binary} ${stdout.trim()}` };
      } catch {
        // On Windows, also try where.exe to confirm binary exists before probing
        if (isWin) {
          try {
            const { stdout: whereOut } = await execFileAsync('where', [binary]);
            const binPath = whereOut.trim().split(/\r?\n/)[0]?.trim();
            if (binPath) {
              const { stdout } = await execFileAsync(binPath, ['--version']);
              return { ok: true, detail: `${binary} ${stdout.trim()}` };
            }
          } catch { /* continue to next binary */ }
        }
        continue;
      }
    }
    // Windows fallback: agy-node.cmd
    if (isWin) {
      const agyNode = path.join(os.homedir(), 'AppData', 'Roaming', 'antigravity', 'bin', 'agy-node.cmd');
      if (fs.existsSync(agyNode)) {
        try {
          const { stdout } = await execFileAsync(agyNode, ['--version']);
          return { ok: true, detail: `agy-node ${stdout.trim()}` };
        } catch { /* fall through */ }
        return { ok: true, detail: 'agy-node available (desktop 2.8.1)' };
      }
    }
    return { ok: false, detail: `Neither gemini nor agy found on PATH` };
  },

  async inspectSkills(repoRoot?: string): Promise<{
    skills: string[];
    locations: string[];
    surfaces?: { ide: string[]; cli: string[] };
  }> {
    const ideRoots = [
      path.join(ANTIGRAVITY_HOME, 'skills'),
      path.join(os.homedir(), '.gemini', 'antigravity', 'builtin', 'skills'),
      ...(repoRoot ? [path.join(repoRoot, '.agents', 'skills'), path.join(repoRoot, '.gemini', 'skills')] : []),
    ];
    const cliRoots = [
      path.join(os.homedir(), '.gemini', 'antigravity-cli', 'skills'),
      ...(repoRoot ? [path.join(repoRoot, '.agents', 'skills')] : []),
    ];
    const locations = [...new Set([...ideRoots, ...cliRoots])];

    const discoverFromRoots = (roots: string[]): string[] => {
      const discovered = new Set<string>();
      for (const loc of roots) {
        if (!fs.existsSync(loc)) continue;
        try {
          const entries = fs.readdirSync(loc, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && fs.existsSync(path.join(loc, entry.name, 'SKILL.md'))) {
              discovered.add(entry.name);
            }
          }
        } catch { /* ignore */ }
      }
      return [...discovered].sort();
    };

    const ideSkills = discoverFromRoots(ideRoots);
    const cliSkills = discoverFromRoots(cliRoots);
    const allSkills = [...new Set([...ideSkills, ...cliSkills])].sort();

    return {
      skills: allSkills,
      locations: locations.filter((l) => fs.existsSync(l)),
      surfaces: { ide: ideSkills, cli: cliSkills },
    };
  },

  async probePlanning(): Promise<{ supported: boolean; mode: string; reason?: string }> {
    const probe = await whichAntigravity();
    if (!probe) {
      return { supported: false, mode: 'antigravity-planning-mode', reason: 'Antigravity CLI (gemini/agy) is not found on PATH' };
    }
    return { supported: true, mode: 'antigravity-planning-mode' };
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

export interface AntigravityMcpResolution {
  selectedPath: string | null;
  surface: 'shared-central' | 'desktop-ide' | 'cli-surface' | 'workspace' | 'none';
  candidateLocations: readonly string[];
  provenance: {
    searched: readonly string[];
    found: readonly string[];
  };
}

export function resolveAntigravityMcpPaths(repoRoot?: string): AntigravityMcpResolution {
  const candidates = [
    path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json'),
    path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json'),
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'mcp_config.json'),
    ...(repoRoot ? [path.join(repoRoot, '.agents', 'mcp_config.json'), path.join(repoRoot, '.gemini', 'mcp_config.json')] : []),
  ];

  const found = candidates.filter((p) => fs.existsSync(p));
  const selectedPath = found[0] ?? null;

  let surface: AntigravityMcpResolution['surface'] = 'none';
  if (selectedPath) {
    if (selectedPath.includes('antigravity-cli')) surface = 'cli-surface';
    else if (selectedPath.includes('.agents') || selectedPath.includes(path.join('.gemini', 'mcp_config.json'))) surface = 'workspace';
    else if (selectedPath.includes('antigravity')) surface = 'desktop-ide';
    else surface = 'shared-central';
  }

  return {
    selectedPath,
    surface,
    candidateLocations: candidates,
    provenance: {
      searched: candidates,
      found,
    },
  };
}
