import { describe, expect, it } from 'vitest';
import { resolveOmpAgentDir } from './adapter.js';

describe('OMP adapter', () => {
  it('preserves an explicit Windows agent directory', () => {
    const agentDir = 'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\omp-agent';
    expect(resolveOmpAgentDir({ PI_CODING_AGENT_DIR: agentDir }, 'C:\\Users\\RUNNER')).toBe(agentDir);
  });
});
