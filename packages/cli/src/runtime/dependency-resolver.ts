import fs from 'node:fs';
import path from 'node:path';

export type DependencySource = 'environment' | 'package-runtime' | 'host-runtime' | 'path' | 'known-candidate';

export interface ResolvedDependency {
  command: string;
  source: DependencySource;
}

export interface DependencyResolutionRequest {
  name: string;
  env?: NodeJS.ProcessEnv;
  envVar?: string;
  packageCandidates?: readonly string[];
  hostCandidates?: readonly string[];
  knownCandidates?: readonly string[];
  pathValue?: string;
  platform?: NodeJS.Platform;
}

function executableNames(name: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform !== 'win32' || path.extname(name)) return [name];
  const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  return [name, ...extensions.map((extension) => `${name}${extension.toLowerCase()}`), ...extensions.map((extension) => `${name}${extension.toUpperCase()}`)];
}

function isUsableFile(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (platform === 'win32') return true;
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function firstCandidate(candidates: readonly string[] | undefined, platform: NodeJS.Platform): string | null {
  for (const candidate of candidates ?? []) {
    if (candidate && isUsableFile(path.resolve(candidate), platform)) return path.resolve(candidate);
  }
  return null;
}

export function resolveDependency(request: DependencyResolutionRequest): ResolvedDependency | null {
  const env = request.env ?? process.env;
  const platform = request.platform ?? process.platform;
  const fromEnvironment = request.envVar ? env[request.envVar] : undefined;
  if (fromEnvironment) {
    const candidate = path.resolve(fromEnvironment);
    if (!isUsableFile(candidate, platform)) throw new Error(`${request.envVar} points to a missing or non-executable dependency: ${candidate}`);
    return { command: candidate, source: 'environment' };
  }

  for (const [source, candidates] of [
    ['package-runtime', request.packageCandidates],
    ['host-runtime', request.hostCandidates],
  ] as const) {
    const candidate = firstCandidate(candidates, platform);
    if (candidate) return { command: candidate, source };
  }

  const names = executableNames(request.name, platform, env);
  for (const directory of (request.pathValue ?? env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = path.resolve(directory, name);
      if (isUsableFile(candidate, platform)) return { command: candidate, source: 'path' };
    }
  }

  const known = firstCandidate(request.knownCandidates, platform);
  return known ? { command: known, source: 'known-candidate' } : null;
}

export function resolveNodeRuntime(env: NodeJS.ProcessEnv = process.env): ResolvedDependency {
  const resolved = resolveDependency({
    name: 'node',
    env,
    envVar: 'AGENT_RULES_NODE',
    packageCandidates: [process.execPath],
  });
  if (!resolved) throw new Error('Node.js runtime is required for agent-rules lifecycle adapters');
  return resolved;
}
