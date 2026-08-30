import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function hostPath(value: string): typeof path {
  return path.win32.isAbsolute(value) ? path.win32 : path;
}

/** OMP-native inspection without treating imported third-party config as proof. */
export function resolveOmpAgentDir(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  if (env.PI_CODING_AGENT_DIR) return hostPath(env.PI_CODING_AGENT_DIR).resolve(env.PI_CODING_AGENT_DIR);
  const profile = env.OMP_PROFILE || env.PI_PROFILE;
  const nativePath = hostPath(home);
  return profile ? nativePath.join(home, '.omp', 'profiles', profile, 'agent') : nativePath.join(home, '.omp', 'agent');
}

export function inspectOmpNative(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): {
  agentDir: string; managedInstructions: boolean; skills: number; mcpJson: 'absent' | 'valid' | 'invalid';
} {
  const agentDir = resolveOmpAgentDir(env, home);
  const nativePath = hostPath(agentDir);
  const instruction = nativePath.join(agentDir, 'AGENTS.md');
  const skillsDir = nativePath.join(agentDir, 'skills');
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(nativePath.join(skillsDir, entry.name, 'SKILL.md'))).length
    : 0;
  const mcp = nativePath.join(agentDir, 'mcp.json');
  let mcpJson: 'absent' | 'valid' | 'invalid' = 'absent';
  if (fs.existsSync(mcp)) {
    try { JSON.parse(fs.readFileSync(mcp, 'utf8')); mcpJson = 'valid'; } catch { mcpJson = 'invalid'; }
  }
  return { agentDir, managedInstructions: fs.existsSync(instruction) && fs.readFileSync(instruction, 'utf8').includes('agent-rules:managed:omp'), skills, mcpJson };
}
