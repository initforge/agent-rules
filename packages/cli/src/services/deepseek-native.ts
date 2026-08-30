import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import type { CertificationReceipt, Detection } from './native-installer.js';
import { getStandardMcpServers } from '../runtime/mcp-convergence.js';

export interface DshBackupEntry {
  relativePath: string;
  backupFile: string | null;
  mode: number | null;
  appliedSha256?: string | null;
}

function sealDshBackup(backupManifest: string, home: string): void {
  const manifest = JSON.parse(fs.readFileSync(backupManifest, 'utf8')) as { schema?: string; entries?: DshBackupEntry[] };
  if (manifest.schema !== 'agent-rules/dsh-backup/v1' || !Array.isArray(manifest.entries)) throw new Error(`invalid DSH rollback manifest: ${backupManifest}`);
  for (const entry of manifest.entries) {
    const target = path.resolve(home, entry.relativePath);
    if (!target.startsWith(path.resolve(home) + path.sep)) throw new Error(`DSH rollback path escapes DSH_HOME: ${entry.relativePath}`);
    entry.appliedSha256 = fs.existsSync(target) && fs.statSync(target).isFile() ? sha256(fs.readFileSync(target)) : null;
  }
  atomicWriteNativeFile(backupManifest, JSON.stringify(manifest, null, 2) + '\n');
}

/** Exact public package used by DSH's native Cordis MCP client plugin. */
export const DSH_MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client';
/** Fallback only when the installed DSH closure cannot expose its package metadata. */
export const DEFAULT_DSH_MCP_CLIENT_VERSION = '0.1.0-rc.8';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashFiles(files: readonly string[]): string {
  const hash = createHash('sha256');
  for (const file of files) hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function atomicWriteNativeFile(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID().slice(0, 8)}`;
  try {
    fs.writeFileSync(temporary, content, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* preserve the mutation error */ }
    throw error;
  }
}

function findRepositoryRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'skills'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

export function dshNativeSkillFiles(repositoryRoot = findRepositoryRoot()): string[] {
  const root = path.join(repositoryRoot, 'skills');
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillRoot = path.join(root, entry.name);
    const stack = [skillRoot];
    while (stack.length > 0) {
      const directory = stack.pop()!;
      for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, child.name);
        if (child.isDirectory()) stack.push(target);
        else if (child.isFile()) files.push(target);
      }
    }
  }
  return files.sort();
}

export function resolveDshMcpClientVersion(home: string, binaryPath?: string): string | null {
  const explicit = process.env.DSH_MCP_CLIENT_VERSION?.trim();
  if (explicit) return explicit;
  const binaryDir = binaryPath ? path.dirname(binaryPath) : '';
  const candidates = [
    path.join(home, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'package.json'),
    path.join(binaryDir, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'package.json'),
    path.join(binaryDir, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'package.json'),
    path.join(binaryDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; version?: string; dependencies?: Record<string, string> };
      if (parsed.name === DSH_MCP_CLIENT_PACKAGE && parsed.version) return parsed.version;
      const declared = parsed.dependencies?.[DSH_MCP_CLIENT_PACKAGE];
      if (declared && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(declared)) return declared;
    } catch { /* invalid package metadata is not native proof */ }
  }
  return DEFAULT_DSH_MCP_CLIENT_VERSION;
}

function runDsh(binaryPath: string, args: readonly string[], home: string, timeout: number): { status: number | null; stdout: string; stderr: string; error?: Error } {
  const isCmdScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binaryPath);
  const isPowerShellScript = process.platform === 'win32' && /\.ps1$/i.test(binaryPath);
  const actual = isCmdScript ? (process.env.ComSpec || 'cmd.exe') : isPowerShellScript ? (process.env.POWERSHELL_EXE || 'powershell.exe') : binaryPath;
  const actualArgs = isCmdScript
    ? ['/d', '/s', '/c', binaryPath, ...args]
    : isPowerShellScript
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', binaryPath, ...args]
      : [...args];
  const result = spawnSync(actual, actualArgs, {
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    env: { ...process.env, DSH_HOME: home },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    ...(result.error ? { error: result.error } : {}),
  };
}

export function readDshDumpConfig(home: string, binaryPath: string | undefined, profile: string): { ok: boolean; output: string } {
  if (!binaryPath) return { ok: false, output: '' };
  const result = runDsh(binaryPath, ['--profile', profile, '--dump-config'], home, 30_000);
  return { ok: result.status === 0 && !result.error, output: `${result.stdout}\n${result.stderr}` };
}

/** Discover every existing DSH profile; no fixed web/headless-only target list. */
export function discoverDshProfiles(home: string): string[] {
  const profilesRoot = path.join(home, 'profiles');
  if (!fs.existsSync(profilesRoot)) return [];
  return fs.readdirSync(profilesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules' && /^[A-Za-z0-9._-]+$/.test(entry.name))
    .filter((entry) => fs.existsSync(path.join(profilesRoot, entry.name, 'package.json')) || fs.existsSync(path.join(profilesRoot, entry.name, 'cordis.patch.yml')))
    .map((entry) => entry.name)
    .sort();
}

interface DshDumpRow {
  id: string;
  body: string;
}

function readDshDumpRows(output: string): Map<string, DshDumpRow> {
  const rows = new Map<string, DshDumpRow>();
  const matches = [...output.matchAll(/^- id: ([^\r\n]+)\r?\n([\s\S]*?)(?=^- id: |$(?![\s\S]))/gm)];
  for (const match of matches) rows.set(match[1]!.trim(), { id: match[1]!.trim(), body: match[2]! });
  return rows;
}

export function inspectDshNativeDump(output: string, expectedServerNames: readonly string[] = Object.keys(getStandardMcpServers(os.homedir())).sort()): {
  instructionEnabled: boolean;
  skillsEnabled: boolean;
  mcpServerNames: string[];
  mcpRowsValid: boolean;
} {
  const rows = readDshDumpRows(output);
  const enabled = (id: string): boolean => {
    const row = rows.get(id);
    return row !== undefined && !/^\s+disabled:\s+true\s*$/m.test(row.body);
  };
  const mcpServerNames = expectedServerNames.filter((serverName) => {
    const row = rows.get(`agent-rules-dsh-mcp-${serverName}`);
    return row !== undefined
      && new RegExp(`name:\\s*['"]?${DSH_MCP_CLIENT_PACKAGE.replace('/', '\\/')}['"]?`).test(row.body)
      && new RegExp(`serverName:\\s*["']?${serverName}["']?`).test(row.body)
      && /transport:\s*["']?stdio["']?/.test(row.body)
      && /command:\s*\S+/.test(row.body)
      && /args:\s*/.test(row.body);
  });
  return {
    instructionEnabled: enabled('agent-instructions'),
    skillsEnabled: enabled('skill') && enabled('skill-filesystem') && enabled('tool-skill'),
    mcpServerNames,
    mcpRowsValid: mcpServerNames.length === expectedServerNames.length,
  };
}

export interface DshNativeReadback {
  profiles: string[];
  skillParity: ReturnType<typeof dshSkillParity>;
  nativeFilesPresent: boolean;
  nativeMcp: boolean;
  managed: boolean;
  sha256: string;
  dumpUnavailableReason?: string;
}

export function inspectDshNativeReadback(detection: Pick<Detection, 'homeDir' | 'binaryPath'>): DshNativeReadback {
  const home = detection.homeDir;
  const agents = path.join(home, 'AGENTS.md');
  const profiles = discoverDshProfiles(home);
  const profileFiles = profiles.map((profile) => path.join(home, 'profiles', profile, 'cordis.patch.yml'));
  const files = [agents, ...profileFiles];
  const skillParity = dshSkillParity(home);
  const dumps = profiles.map((profile) => readDshDumpConfig(home, detection.binaryPath, profile));
  const dumpUnavailableReason = dumps.map((dump) => dump.output).find((output) => /EPERM|EACCES|SQLITE_READONLY|readonly|operation not permitted/i.test(output));
  const inspected = dumps.map((dump) => inspectDshNativeDump(dump.output));
  const baseReadback = profiles.length > 0 && dumps.every((dump, index) => dump.ok && inspected[index]!.instructionEnabled && inspected[index]!.skillsEnabled);
  const dumpReadback = baseReadback && dumps.every((_, index) => inspected[index]!.mcpRowsValid);
  const managed = fs.existsSync(agents)
    && fs.readFileSync(agents, 'utf8').includes('agent-rules:managed:deepseek-harness')
    && profileFiles.every((file) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('agent-rules:managed:deepseek-harness BEGIN'));
  // Base installation proves only instructions and skills. MCP is a separately
  // leased integration and must not make core installation mutate configuration.
  const nativeFilesPresent = managed && skillParity.ok && (baseReadback || Boolean(dumpUnavailableReason));
  const body = files.filter((file) => fs.existsSync(file)).map((file) => sha256(fs.readFileSync(file))).join('');
  return {
    profiles,
    skillParity,
    nativeFilesPresent,
    nativeMcp: dumpReadback,
    managed,
    sha256: sha256(`${body}:${skillParity.sha256}`),
    ...(dumpUnavailableReason ? { dumpUnavailableReason: dumpUnavailableReason.trim().slice(0, 1000) } : {}),
  };
}

export function dshSkillParity(home: string, repositoryRoot = findRepositoryRoot()): { ok: boolean; count: number; expected: number; sha256: string } {
  const sourceRoot = path.join(repositoryRoot, 'skills');
  const sourceDirs = fs.existsSync(sourceRoot)
    ? fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  const hashes: string[] = [];
  let count = 0;
  for (const name of sourceDirs) {
    const sourceFiles = dshNativeSkillFiles(repositoryRoot).filter((file) => file.startsWith(path.join(sourceRoot, name) + path.sep));
    const targetFiles = sourceFiles.map((file) => path.join(home, 'skills', path.relative(sourceRoot, file)));
    if (sourceFiles.length === 0 || targetFiles.some((file) => !fs.existsSync(file) || !fs.statSync(file).isFile())) continue;
    if (sourceFiles.some((source, index) => !fs.readFileSync(source).equals(fs.readFileSync(targetFiles[index]!)))) continue;
    count += 1;
    hashes.push(`${name}:${hashFiles(sourceFiles)}`);
  }
  return { ok: sourceDirs.length > 0 && count === sourceDirs.length, count, expected: sourceDirs.length, sha256: sha256(hashes.sort().join('\n')) };
}

function mcpCordisRows(ids?: readonly string[]): string[] {
  const requested = ids ? new Set(ids) : null;
  return Object.entries(getStandardMcpServers(os.homedir())).filter(([serverName]) => !requested || requested.has(serverName)).flatMap(([serverName, server]) => [
    `- id: agent-rules-dsh-mcp-${serverName}`,
    `  name: ${JSON.stringify(DSH_MCP_CLIENT_PACKAGE)}`,
    '  config:',
    `    serverName: ${JSON.stringify(serverName)}`,
    '    transport: "stdio"',
    `    command: ${JSON.stringify(server.command)}`,
    `    args: ${JSON.stringify(server.args)}`,
    ...(server.env ? [`    env: ${JSON.stringify(server.env)}`] : []),
  ]);
}

function managedCordisBlock(packageVersion: string, managedMcpRows: string[] = []): string {
  return [
    '# agent-rules:managed:deepseek-harness BEGIN',
    '- id: agent-instructions',
    "  name: '@deepseek-ai/dsh-agent-instructions'",
    '  disabled: false',
    '  config:',
    '    maxBytes: 65536',
    '- id: skill',
    "  name: '@deepseek-ai/dsh-skill'",
    '  disabled: false',
    '- id: skill-filesystem',
    "  name: '@deepseek-ai/dsh-skill-filesystem'",
    '  disabled: false',
    '- id: tool-skill',
    "  name: '@deepseek-ai/dsh-tool-skill'",
    '  disabled: false',
    ...(managedMcpRows.length > 0 ? ['- insert:', ...managedMcpRows.map((line) => `  ${line}`)] : []),
    `# agent-rules:managed:deepseek-harness END (${DSH_MCP_CLIENT_PACKAGE}@${packageVersion})`,
    '',
  ].join('\n');
}

function existingManagedMcpRows(existing: string): string[] {
  const marker = /# agent-rules:managed:deepseek-harness BEGIN[\s\S]*?# agent-rules:managed:deepseek-harness END[^\r\n]*\s*/m;
  const managed = existing.match(marker)?.[0] ?? '';
  const insert = managed.match(/- insert:\s*\n([\s\S]*?)(?=# agent-rules:managed:deepseek-harness END)/m)?.[1] ?? '';
  return insert.split(/\r?\n/).filter((line) => line.startsWith('  ')).map((line) => line.slice(2));
}

function mcpRowBlocks(rows: readonly string[]): Array<{ id: string; lines: string[] }> {
  const blocks: Array<{ id: string; lines: string[] }> = [];
  let current: string[] = [];
  for (const line of rows) {
    if (line.startsWith('- id: agent-rules-dsh-mcp-')) {
      if (current.length) {
        const id = current[0]!.slice('- id: agent-rules-dsh-mcp-'.length).trim();
        blocks.push({ id, lines: current });
      }
      current = [line];
    } else if (current.length) current.push(line);
  }
  if (current.length) {
    const id = current[0]!.slice('- id: agent-rules-dsh-mcp-'.length).trim();
    blocks.push({ id, lines: current });
  }
  return blocks;
}

function mergeCordisPatch(existing: string, packageVersion: string, managedMcpRows?: string[]): string {
  // A core install preserves an existing managed MCP lease byte-for-byte in
  // meaning, but never creates or removes one. Only an explicit integration
  // operation may request fresh MCP rows.
  const block = managedCordisBlock(packageVersion, managedMcpRows ?? existingManagedMcpRows(existing));
  const marker = /# agent-rules:managed:deepseek-harness BEGIN[\s\S]*?# agent-rules:managed:deepseek-harness END[^\r\n]*\s*/m;
  if (marker.test(existing)) return existing.replace(marker, block);
  const lines = existing.trimEnd().split(/\r?\n/);
  if (lines.at(-1)?.trim() === '[]' && lines.slice(0, -1).every((line) => !line.trim() || line.trim().startsWith('#'))) {
    const prefix = lines.slice(0, -1).join('\n').trimEnd();
    return `${prefix}${prefix ? '\n' : ''}${block}`;
  }
  return `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${block}`;
}

/** Change only selected agent-rules MCP rows in native Cordis patches. This
 * never removes the shared DSH plugin or user-owned rows. */
export function setDshMcpRegistration(
  detection: Detection,
  ids: readonly string[],
  enabled: boolean,
): { profiles: string[]; changed: boolean } {
  const home = detection.homeDir;
  const profiles = discoverDshProfiles(home);
  const packageVersion = resolveDshMcpClientVersion(home, detection.binaryPath);
  if (!packageVersion) throw new Error(`cannot resolve an exact installed ${DSH_MCP_CLIENT_PACKAGE} version for DSH native projection`);
  const requested = new Set(ids);
  let changed = false;
  for (const profile of profiles) {
    const patchPath = path.join(home, 'profiles', profile, 'cordis.patch.yml');
    const existing = fs.existsSync(patchPath) ? fs.readFileSync(patchPath, 'utf8') : '';
    const blocks = mcpRowBlocks(existingManagedMcpRows(existing));
    const retained = blocks.filter((block) => !requested.has(block.id));
    const rows = retained.flatMap((block) => block.lines);
    if (enabled) rows.push(...mcpCordisRows(ids));
    const next = mergeCordisPatch(existing, packageVersion, rows);
    if (next !== existing) {
      atomicWriteNativeFile(patchPath, next);
      changed = true;
    }
    const dump = readDshDumpConfig(home, detection.binaryPath, profile);
    if (!dump.ok) throw new Error(`DSH dump-config failed for ${profile}`);
    const observed = inspectDshNativeDump(dump.output, ids).mcpServerNames;
    if (enabled && observed.length !== ids.length) throw new Error(`DSH MCP readback missing selected registration for ${profile}`);
    if (!enabled && observed.some((id) => requested.has(id))) throw new Error(`DSH MCP readback retained disabled registration for ${profile}`);
  }
  return { profiles, changed };
}

function profileHasInstalledMcp(home: string, profile: string): boolean {
  return fs.existsSync(path.join(home, 'profiles', profile, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'package.json'));
}

export async function installDeepseekHarnessNative(
  detection: Detection,
  backupDir: string,
  certify: () => Promise<CertificationReceipt>,
  options: { enableMcp?: boolean } = {},
): Promise<CertificationReceipt> {
  const home = detection.homeDir;
  const profiles = discoverDshProfiles(home);
  if (profiles.length === 0) throw new Error(`DSH has no discoverable profiles under ${path.join(home, 'profiles')}`);
  const repositoryRoot = findRepositoryRoot();
  const agentsPath = path.join(home, 'AGENTS.md');
  const patchPaths = profiles.map((profile) => path.join(home, 'profiles', profile, 'cordis.patch.yml'));
  const profileMetadata = profiles.flatMap((profile) => [
    path.join(home, 'profiles', profile, 'package.json'),
    path.join(home, 'profiles', profile, 'pnpm-lock.yaml'),
    path.join(home, 'profiles', profile, 'pnpm-workspace.yaml'),
  ]);
  const skillSources = dshNativeSkillFiles(repositoryRoot);
  const sourceSkillsRoot = path.join(repositoryRoot, 'skills');
  const skillTargets = skillSources.map((source) => path.join(home, 'skills', path.relative(sourceSkillsRoot, source)));
  const files = [agentsPath, ...patchPaths, ...profileMetadata, ...skillTargets];
  const before = new Map<string, Buffer | null>();
  const beforeModes = new Map<string, number | null>();
  const backupEntries: DshBackupEntry[] = [];
  fs.mkdirSync(backupDir, { recursive: true });
  for (const file of files) {
    const exists = fs.existsSync(file);
    const content = exists ? fs.readFileSync(file) : null;
    before.set(file, content);
    const mode = exists ? fs.statSync(file).mode & 0o7777 : null;
    beforeModes.set(file, mode);
    const relativePath = path.relative(home, file).replace(/\\/g, '/');
    const backupFile = content !== null ? `${sha256(relativePath).slice(0, 12)}-${relativePath.replace(/\//g, '__')}` : null;
    if (content !== null && backupFile) atomicWriteNativeFile(path.join(backupDir, backupFile), content);
    backupEntries.push({ relativePath, backupFile, mode });
  }
  const backupManifest = path.join(backupDir, '.dsh-backup.json');
  atomicWriteNativeFile(backupManifest, JSON.stringify({ schema: 'agent-rules/dsh-backup/v1', home, plugin_install_started: false, entries: backupEntries }, null, 2) + '\n');
  const packageVersion = resolveDshMcpClientVersion(home, detection.binaryPath);
  if (!packageVersion) throw new Error(`cannot resolve an exact installed ${DSH_MCP_CLIENT_PACKAGE} version for DSH native projection`);
  const packageSpec = `${DSH_MCP_CLIENT_PACKAGE}@${packageVersion}`;
  const ruleNames = fs.readFileSync(path.join(repositoryRoot, 'rules', 'manifest.yaml'), 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+([\w.-]+\.md)\s*$/)?.[1])
    .filter((name): name is string => Boolean(name));
  if (ruleNames.length !== 5) throw new Error(`canonical rules manifest must name exactly five rules; found ${ruleNames.length}`);
  const canonicalRules = ruleNames.map((name) => fs.readFileSync(path.join(repositoryRoot, 'rules', name), 'utf8').trim()).join('\n\n');
  const managedAgents = [
    '<!-- agent-rules:managed:deepseek-harness BEGIN (native DSH system prompt seam) -->',
    '# Agent Rules — DeepSeek Harness native',
    'The host-native Cordis profile is the authority for this session.',
    canonicalRules,
    '<!-- agent-rules:managed:deepseek-harness END -->',
    '',
  ].join('\n');
  const agentsMarker = /<!-- agent-rules:managed:deepseek-harness BEGIN[\s\S]*?<!-- agent-rules:managed:deepseek-harness END -->\s*/m;
  let pluginInstallStarted = false;
  try {
    fs.mkdirSync(home, { recursive: true });
    const existingAgents = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
    atomicWriteNativeFile(agentsPath, agentsMarker.test(existingAgents) ? existingAgents.replace(agentsMarker, managedAgents) : `${existingAgents.trimEnd()}${existingAgents.trim() ? '\n\n' : ''}${managedAgents}`);
    for (const [index, source] of skillSources.entries()) atomicWriteNativeFile(skillTargets[index]!, fs.readFileSync(source));
    for (const profile of profiles) {
      if (options.enableMcp && !profileHasInstalledMcp(home, profile)) {
        const result = runDsh(detection.binaryPath ?? 'dsh', ['plugin', '--profile', profile, 'add', packageSpec], home, 120_000);
        pluginInstallStarted = true;
        atomicWriteNativeFile(backupManifest, JSON.stringify({ schema: 'agent-rules/dsh-backup/v1', home, plugin_install_started: true, entries: backupEntries }, null, 2) + '\n');
        if (result.status !== 0 || result.error) throw new Error(`DSH plugin add failed for ${profile}: ${(result.stderr || result.stdout || result.error?.message || '').trim() || `exit ${result.status}`}`);
      }
      const patchPath = path.join(home, 'profiles', profile, 'cordis.patch.yml');
      const existing = fs.existsSync(patchPath) ? fs.readFileSync(patchPath, 'utf8') : '';
      atomicWriteNativeFile(patchPath, mergeCordisPatch(existing, packageVersion, options.enableMcp ? mcpCordisRows() : undefined));
      const dump = readDshDumpConfig(home, detection.binaryPath, profile);
      const inspected = inspectDshNativeDump(dump.output);
      if (!dump.ok || !inspected.instructionEnabled || !inspected.skillsEnabled || (options.enableMcp && !inspected.mcpRowsValid)) {
        throw new Error(`DSH native dump-config readback failed for ${profile}: instruction=${inspected.instructionEnabled}, skills=${inspected.skillsEnabled}, MCP=${inspected.mcpServerNames.join(',')}`);
      }
    }
    sealDshBackup(backupManifest, home);
    return await certify();
  } catch (error) {
    await restoreDshNative(before, home, profiles, pluginInstallStarted ? detection.binaryPath : undefined, DSH_MCP_CLIENT_PACKAGE, beforeModes);
    throw error;
  }
}

export async function restoreDshNative(
  before: Map<string, Buffer | null>,
  home: string,
  profiles: readonly string[],
  binaryPath?: string,
  packageName = DSH_MCP_CLIENT_PACKAGE,
  beforeModes?: Map<string, number | null>,
): Promise<void> {
  const rollbackErrors: string[] = [];
  if (binaryPath) {
    for (const profile of profiles) {
      const packageFile = path.join(home, 'profiles', profile, 'package.json');
      const packageWasPresent = before.get(packageFile)?.toString('utf8').includes(packageName) ?? false;
      if (packageWasPresent) continue;
      if (!profileHasInstalledMcp(home, profile)) continue;
      const result = runDsh(binaryPath, ['plugin', '--profile', profile, 'remove', packageName], home, 30_000);
      if (result.status !== 0 || result.error) rollbackErrors.push(`plugin remove ${profile}: ${(result.stderr || result.stdout || result.error?.message || '').trim() || `exit ${result.status ?? 'unknown'}`}`);
    }
  }
  for (const [file, content] of before) {
    if (content === null) {
      try { if (fs.existsSync(file)) fs.rmSync(file, { force: true }); } catch (error) { rollbackErrors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`); }
    } else {
      try {
        atomicWriteNativeFile(file, content);
        const mode = beforeModes?.get(file);
        if (mode !== undefined && mode !== null) fs.chmodSync(file, mode);
      } catch (error) { rollbackErrors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  if (rollbackErrors.length) throw new Error(`DSH rollback failed: ${rollbackErrors.join('; ')}`);
}

export function removeDshNativeProjection(detection: Pick<Detection, 'homeDir'>): void {
  const agents = path.join(detection.homeDir, 'AGENTS.md');
  const agentsMarker = /<!-- agent-rules:managed:deepseek-harness BEGIN[\s\S]*?<!-- agent-rules:managed:deepseek-harness END -->\s*/m;
  if (fs.existsSync(agents)) {
    const current = fs.readFileSync(agents, 'utf8');
    if (agentsMarker.test(current)) atomicWriteNativeFile(agents, `${current.replace(agentsMarker, '').trimEnd()}\n`);
  }
  const cordisMarker = /# agent-rules:managed:deepseek-harness BEGIN[\s\S]*?# agent-rules:managed:deepseek-harness END[^\r\n]*\s*/m;
  for (const profile of discoverDshProfiles(detection.homeDir)) {
    const patch = path.join(detection.homeDir, 'profiles', profile, 'cordis.patch.yml');
    if (!fs.existsSync(patch)) continue;
    const current = fs.readFileSync(patch, 'utf8');
    if (cordisMarker.test(current)) atomicWriteNativeFile(patch, `${current.replace(cordisMarker, '').trimEnd()}\n`);
  }
}
