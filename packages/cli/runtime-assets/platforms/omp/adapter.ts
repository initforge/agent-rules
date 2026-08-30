import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** OMP-native inspection without treating imported third-party config as proof. */
export function resolveOmpAgentDir(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  if (env.PI_CODING_AGENT_DIR) return path.resolve(env.PI_CODING_AGENT_DIR);
  const profile = env.OMP_PROFILE || env.PI_PROFILE;
  return profile ? path.join(home, '.omp', 'profiles', profile, 'agent') : path.join(home, '.omp', 'agent');
}

export function inspectOmpNative(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): {
  agentDir: string; managedInstructions: boolean; skills: number; mcpJson: 'absent' | 'valid' | 'invalid';
} {
  const agentDir = resolveOmpAgentDir(env, home);
  const instruction = path.join(agentDir, 'AGENTS.md');
  const skillsDir = path.join(agentDir, 'skills');
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md'))).length
    : 0;
  const mcp = path.join(agentDir, 'mcp.json');
  let mcpJson: 'absent' | 'valid' | 'invalid' = 'absent';
  if (fs.existsSync(mcp)) {
    try { JSON.parse(fs.readFileSync(mcp, 'utf8')); mcpJson = 'valid'; } catch { mcpJson = 'invalid'; }
  }
  return { agentDir, managedInstructions: fs.existsSync(instruction) && fs.readFileSync(instruction, 'utf8').includes('agent-rules:managed:omp'), skills, mcpJson };
}
