import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRuntimeStateRoot } from './locator.js';

export interface StateCleanupResult {
  removed: string[];
  retained: string[];
  needsUser: string[];
}

const knownTerminalSchemas = new Set([
  'agent-rules/installation-receipt/v1',
  'agent-rules/legacy-skill-migration-backup/v1',
  'agent-rules/dsh-backup/v1',
]);

export type LegacyFingerprintMap = Readonly<Record<string, ReadonlySet<string>>>;

const legacyCodexScriptFingerprints: LegacyFingerprintMap = {
  'scripts/skill-gate.py': new Set([
    '3422a1152eaee100e5688e0a5e9a8440e87ab811ab26f9ed67622619b1280f9b',
    '072bf06923062e3e0795f1e990765dbd1f44f3da834fe9797f0aed3953cfda28',
    '9aa50f86f26b2e55888a98467a83ce995c730aeffca89a64115d6c68fe221719',
    '70d8878bb37e0e0e646b733582c4ed458784534d62fbf704a98e0bc51f46c850',
    '07616359ee17f015db1ff2d7ecf510e16e9b6806b9a21ffad0e8357989657431',
    '83bf6be6a08bb85022adbd1ef03860ddad3a011957b04f91151e05f0a346a8f4',
    '5a05b6d76b40b8766e4f212da02bb08a6cfaeb742646482c4a3bbdf3ca8fe067',
    'e6dfc2c9ce94c0c952f0093b04cd84c0744c71a831ebd356b6aa0b25f361dbbb',
    '4c5c13a4dc5a5fc75a1393ff4092b40a6e1927a6c174308ae0c5789a7b909ae7',
    'f05697d78370b69040632fa40c56ccbc95e6491d7217b92f1a90598944d363db',
    '613d506ba9227f12d73b467cb6d3154fea4c4741fe0c8ab329c12ab6cde7fc03',
    '15ffe25843a4c4c0fc0dc63d4ffd042905a175021892ab9c78acf202e5096984',
    'd08b6bb2345f0d113e8dc9ccdaba2e8f1e5a1c6dcd51c83545c4601a6a418ef3',
    'f2b15b0ed5a791e9656c034d89f72349dbde38d7e60341f5ef24558a92df3fc1',
    '60ae0e1d9ff753d901cf644b61649742e0ad5bef64994f315754a736e12c8c9e',
  ]),
  'scripts/skill-gate.sh': new Set([
    '1de54e7b143d49e8c1f70d9d9cb94db784fecaadd6c5f44f2312304c3e6f5707',
    '15f7afdf1233cb87bb3d9534c5322f0982d606c22292a85279df36b877dfe92d',
    '7723ebbd978dfcbcb39a19405484f5e69a1ef0ffc1ba18b58ca0437e2087c4e2',
  ]),
  'scripts/context-router.py': new Set([
    'f7c423ecd098f0e08c8aa3361753490038f80758f925b6e8eb2acb675aa43a1e',
    '0083f9def38ed35cf1a3bf752df683290c41f24f72af68b36c2e21622fd3f817',
    '0662857605002dc0cc8f1f5838b42639ca774f5b4d7cb8f5e0839865da789c7b',
    'b26fa735bfe36bdf721f564d31795b3a0161252d7dae497c17c0dbbf9237bf1e',
    '775d24b1da8ccdabcd8f418b4851a27d0562ec080999b84834d0e3bf3969f411',
    '7112a9c31f1de8c113ded6d8f93d1f1931ef3adda348a398f3da110d936cc49d',
    'c4b3cd9e9bd029d78efbbebbf1f9126d600d71a6ac6265ccc37e902f0b7960df',
  ]),
  'scripts/context_router.py': new Set([
    '7854f075f103a89a4522fcc9bd5f428eb689ab623392dea9b84f0c13db3cc184',
    '171c701d4836b710cd5d62c635a964bb46c097f3a58daf7602747c460d196310',
  ]),
  'scripts/__pycache__/context_router.cpython-312.pyc': new Set(['ed7a8164ef9c6e0665cb285286c2b900d89f246a2912f0a7e7a05b629a04d103']),
  'scripts/__pycache__/context-router.cpython-312.pyc': new Set(['7feb5459c265fbc596c2e9f7d082b7a443214e6dcf0fc151e3fa806fede0c681']),
};

/** Remove only byte-proven retired Codex hook scripts after a successful host transaction. */
export function cleanupLegacyCodexScripts(
  codexHome = path.join(os.homedir(), '.codex'),
  fingerprints: LegacyFingerprintMap = legacyCodexScriptFingerprints,
): StateCleanupResult {
  const result: StateCleanupResult = { removed: [], retained: [], needsUser: [] };
  const root = path.resolve(codexHome);
  if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) {
    result.retained.push(root);
    result.needsUser.push(`legacy Codex script root is linked: ${root}`);
    return result;
  }
  for (const [relativePath, known] of Object.entries(fingerprints)) {
    const parts = relativePath.split('/');
    const target = path.resolve(root, ...parts);
    if (target === root || !target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target)) continue;
    let parent = root;
    let unsafeParent = false;
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      if (!fs.existsSync(parent)) break;
      const parentStat = fs.lstatSync(parent);
      if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
        unsafeParent = true;
        break;
      }
    }
    if (unsafeParent) {
      result.retained.push(target);
      result.needsUser.push(`legacy Codex script parent is linked or invalid: ${target}`);
      continue;
    }
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      result.retained.push(target);
      result.needsUser.push(`legacy Codex script ownership is not proven: ${target}`);
      continue;
    }
    const digest = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    if (!known.has(digest)) {
      result.retained.push(target);
      result.needsUser.push(`legacy Codex script fingerprint is unknown: ${target}`);
      continue;
    }
    fs.rmSync(target, { force: true });
    result.removed.push(target);
  }
  const cache = path.join(codexHome, 'scripts', '__pycache__');
  if (fs.existsSync(cache) && fs.lstatSync(cache).isDirectory() && !fs.lstatSync(cache).isSymbolicLink() && fs.readdirSync(cache).length === 0) {
    fs.rmSync(cache, { recursive: true, force: true });
    result.removed.push(cache);
  }
  return result;
}

function readSchema(file: string): string | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as { schema?: unknown };
    return typeof value.schema === 'string' ? value.schema : null;
  } catch {
    return null;
  }
}

function removeOwnedDirectory(root: string, marker: string, schemas: ReadonlySet<string>, result: StateCleanupResult): void {
  if (!fs.existsSync(root)) return;
  const markerFiles = fs.statSync(root).isDirectory()
    ? fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, entry.name, marker))
    : [];
  const directMarker = path.join(root, marker);
  const candidates = fs.existsSync(directMarker) ? [directMarker] : markerFiles;
  if (candidates.length === 0 || candidates.some((file) => !schemas.has(readSchema(file) ?? ''))) {
    result.retained.push(root);
    result.needsUser.push(`state ownership is not proven: ${root}`);
    return;
  }
  fs.rmSync(root, { recursive: true, force: true });
  result.removed.push(root);
}

function cleanupExpiredLocks(root: string, result: StateCleanupResult): void {
  if (!fs.existsSync(root)) return;
  const writer = path.join(root, 'worktree-writer.lock');
  let activeLease: string | null = null;
  if (fs.existsSync(writer)) {
    try {
      const value = JSON.parse(fs.readFileSync(writer, 'utf8')) as { leaseId?: unknown; expiresAt?: unknown };
      if (typeof value.leaseId === 'string' && typeof value.expiresAt === 'number' && value.expiresAt > Date.now()) activeLease = value.leaseId;
      else {
        fs.rmSync(writer, { force: true });
        result.removed.push(writer);
      }
    } catch {
      result.retained.push(writer);
      result.needsUser.push(`active lock state is unreadable: ${writer}`);
      return;
    }
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'worktree-writer.lock') continue;
    const file = path.join(root, entry.name);
    const lease = fs.readFileSync(file, 'utf8').trim();
    if (!activeLease || lease !== activeLease) {
      fs.rmSync(file, { force: true });
      result.removed.push(file);
    }
  }
  if (fs.readdirSync(root).length === 0) fs.rmSync(root, { recursive: true, force: true });
}

export function writeCurrentOperationalState(relativePath: string, value: unknown, stateRoot = resolveRuntimeStateRoot()): string {
  const currentRoot = path.resolve(stateRoot, 'current');
  const target = path.resolve(currentRoot, relativePath);
  if (target !== currentRoot && !target.startsWith(`${currentRoot}${path.sep}`)) throw new Error(`operational state path escapes current root: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
  return target;
}

/** Remove only schema-proven terminal history. Unknown or active state is retained. */
export function cleanupOperationalState(stateRoot = resolveRuntimeStateRoot()): StateCleanupResult {
  const result: StateCleanupResult = { removed: [], retained: [], needsUser: [] };
  if (!fs.existsSync(stateRoot)) return result;

  const legacyPreferences = path.join(stateRoot, 'mcp-registration-preferences.json');
  if (fs.existsSync(legacyPreferences)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPreferences, 'utf8')) as { schema?: unknown; disabled?: unknown };
      if (legacy.schema !== 'agent-rules/mcp-registration-preferences/v1' || !Array.isArray(legacy.disabled) || legacy.disabled.some((id) => typeof id !== 'string')) {
        throw new Error('unknown preference schema');
      }
      const current = path.join(stateRoot, 'current', 'mcp-registration-preferences.json');
      let disabled = legacy.disabled as string[];
      if (fs.existsSync(current)) {
        const existing = JSON.parse(fs.readFileSync(current, 'utf8')) as { schema?: unknown; disabled?: unknown };
        if (existing.schema !== legacy.schema || !Array.isArray(existing.disabled) || existing.disabled.some((id) => typeof id !== 'string')) throw new Error('current preference schema is invalid');
        disabled = [...new Set([...disabled, ...(existing.disabled as string[])])].sort();
      }
      writeCurrentOperationalState('mcp-registration-preferences.json', { schema: legacy.schema, disabled }, stateRoot);
      fs.rmSync(legacyPreferences, { force: true });
      result.removed.push(legacyPreferences);
    } catch {
      result.retained.push(legacyPreferences);
      result.needsUser.push(`MCP registration preference ownership is not proven: ${legacyPreferences}`);
    }
  }

  const receipts = path.join(stateRoot, 'receipts');
  if (fs.existsSync(receipts)) {
    const files = fs.readdirSync(receipts, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(receipts, entry.name));
    if (files.every((file) => knownTerminalSchemas.has(readSchema(file) ?? ''))) {
      fs.rmSync(receipts, { recursive: true, force: true });
      result.removed.push(receipts);
    } else {
      result.retained.push(receipts);
      result.needsUser.push(`terminal receipt ownership is not proven: ${receipts}`);
    }
  }

  removeOwnedDirectory(path.join(stateRoot, 'legacy-skill-backups'), 'receipt.json', new Set(['agent-rules/legacy-skill-migration-backup/v1']), result);
  removeOwnedDirectory(path.join(stateRoot, 'debug-dsh-backup'), '.dsh-backup.json', new Set(['agent-rules/dsh-backup/v1']), result);

  const hostReceipts = path.join(stateRoot, 'tmp', 'host-receipts');
  if (fs.existsSync(hostReceipts)) {
    fs.rmSync(hostReceipts, { recursive: true, force: true });
    result.removed.push(hostReceipts);
  }
  cleanupExpiredLocks(path.join(stateRoot, 'tmp', 'locks'), result);
  const tmp = path.join(stateRoot, 'tmp');
  if (fs.existsSync(tmp) && fs.readdirSync(tmp).length === 0) fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}
