import os from 'node:os';
import path from 'node:path';

/**
 * OMP's documented user agent directory.  `PI_CODING_AGENT_DIR` wins, then a
 * named OMP/PI profile, then the default profile.  Keep this resolver small
 * and shared: writing the default directory while a profile is active would
 * create a valid-looking but unused native projection.
 */
export function resolveOmpAgentHome(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  if (env.PI_CODING_AGENT_DIR) return path.resolve(env.PI_CODING_AGENT_DIR);
  const profile = env.OMP_PROFILE || env.PI_PROFILE;
  return profile
    ? path.join(home, '.omp', 'profiles', profile, 'agent')
    : path.join(home, '.omp', 'agent');
}

/** Official Windows installer places omp.exe here before a new shell reloads PATH. */
export function ompBinaryCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'omp', 'omp.exe') : '',
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'omp', 'omp.cmd') : '',
  ];
  return candidates.filter(Boolean);
}
