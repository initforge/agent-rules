import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * C5 M11R47 — Codex platform adapter (Codex baseline).
 *
 * Deterministic model evidence triple: requested/resolved/observed.
 * HOST_UNOBSERVABLE when Codex host exposes no model metadata.
 * Bounded receipt/capsule schema validation — fail closed on malformed input.
 */

// Sentinel for model slots Codex host does not expose.
export const HOST_UNOBSERVABLE = 'HOST_UNOBSERVABLE';

/** Deterministic model evidence triple. */
export interface CodexModelEvidence {
  readonly requested: string;
  readonly resolved: string;
  readonly observed: string;
}

/** Bounded receipt/capsule schema — fail-closed on unknown fields. */
export interface CodexCapsule {
  readonly task?: string;
  readonly context?: unknown;
  readonly rules?: string[];
  readonly model?: string;
}

/** Schema validation result. */
export interface CapsuleValidation {
  readonly valid: boolean;
  readonly error?: string;
}

/** Parse model evidence from Codex stream output. Codex does not expose model metadata — always HOST_UNOBSERVABLE. */
export function parseModelEvidence(_stdout: string, requestedModel?: string): CodexModelEvidence {
  return {
    requested: requestedModel ?? HOST_UNOBSERVABLE,
    resolved: HOST_UNOBSERVABLE,
    observed: HOST_UNOBSERVABLE,
  };
}

/** Bounded schema validation — fail closed on malformed staging input. */
export function validateCapsule(input: unknown): CapsuleValidation {
  if (input === null || input === undefined) {
    return { valid: false, error: 'capsule must not be null or undefined' };
  }
  if (typeof input !== 'object') {
    return { valid: false, error: 'capsule must be an object' };
  }
  const obj = input as Record<string, unknown>;
  // Disallow unknown top-level keys — bounded schema
  const allowed = new Set(['task', 'context', 'rules', 'model']);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return { valid: false, error: `capsule contains unknown field: "${key}"` };
    }
  }
  // Type check known fields
  if (obj.task !== undefined && typeof obj.task !== 'string') {
    return { valid: false, error: 'capsule.task must be a string' };
  }
  if (obj.rules !== undefined && !Array.isArray(obj.rules)) {
    return { valid: false, error: 'capsule.rules must be an array' };
  }
  if (obj.model !== undefined && typeof obj.model !== 'string') {
    return { valid: false, error: 'capsule.model must be a string' };
  }
  return { valid: true };
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

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}
const RULES_DIR = (): string => path.join(codexHome(), 'rules');
const CODEX_BINARY = 'codex';

export const codexAdapter: PlatformAdapter = {
  async detect() {
    const home = codexHome();
    const homeExists = fs.existsSync(home);
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

    return { installed: true, version: 'desktop', path: home };
  },

  async render(context: unknown) {
    const rulesDir = RULES_DIR();
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }
    const ruleFile = path.join(rulesDir, 'agent-rules-context.md');
    const content = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    fs.writeFileSync(ruleFile, content, 'utf-8');
    return ruleFile;
  },

  async stage(context: unknown) {
    // Fail closed: reject malformed staging input before any write.
    const validation = validateCapsule(context);
    if (!validation.valid) {
      throw new Error(`stage rejected: ${validation.error}`);
    }
    const home = codexHome();
    const stagingDir = path.join(home, 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    fs.writeFileSync(capsuleFile, JSON.stringify(context, null, 2), 'utf-8');
    return capsuleFile;
  },

  async activate() {
    const home = codexHome();
    const stagingDir = path.join(home, 'staging');
    const capsuleFile = path.join(stagingDir, 'activation-capsule.json');
    if (!fs.existsSync(capsuleFile)) {
      return { ok: false, detail: 'no staged capsule found' };
    }
    // Fail closed: never activate a malformed capsule.
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(capsuleFile, 'utf-8'));
    } catch {
      return { ok: false, detail: 'activate rejected: capsule is not valid JSON' };
    }
    const validation = validateCapsule(parsed);
    if (!validation.valid) {
      return { ok: false, detail: `activate rejected: ${validation.error}` };
    }
    const dest = path.join(home, 'active-capsule.json');
    fs.copyFileSync(capsuleFile, dest);
    fs.rmSync(capsuleFile);
    return { ok: true };
  },

  async probe() {
    const home = codexHome();
    const homeExists = fs.existsSync(home);
    if (!homeExists) {
      return { ok: false, detail: 'Codex home directory not found' };
    }
    const configOk = fs.existsSync(path.join(home, 'config.toml'));
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
