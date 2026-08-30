import os from 'node:os';
import path from 'node:path';

function hostPath(value: string): typeof path {
  return path.win32.isAbsolute(value) ? path.win32 : path;
}

/** Resolve OMP's active native agent directory without installing callbacks. */
export function resolveOmpAgentHome(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  if (env.PI_CODING_AGENT_DIR) return hostPath(env.PI_CODING_AGENT_DIR).resolve(env.PI_CODING_AGENT_DIR);
  const profile = env.OMP_PROFILE || env.PI_PROFILE;
  const nativePath = hostPath(home);
  return profile ? nativePath.join(home, '.omp', 'profiles', profile, 'agent') : nativePath.join(home, '.omp', 'agent');
}

export function ompBinaryCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'omp', 'omp.exe') : '',
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'omp', 'omp.cmd') : '',
  ].filter(Boolean);
}
