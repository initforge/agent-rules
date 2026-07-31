import path from 'node:path';
import { Autopilot, AutopilotJournal, type AutopilotIdentity, type CiResult, type SessionBoundary } from '@initforge/agent-rules-engine/autopilot';

export async function autopilotCmd(args: string[], basePath = process.cwd(), sessionBoundary?: SessionBoundary): Promise<unknown> {
  const [rawAction = 'status', runId = 'default', value] = args;
  const action = rawAction as 'status' | 'start' | 'continue' | 'ci' | 'checkpoint';
  if (action === 'continue' && !sessionBoundary) throw new Error('native continuation client unavailable; no mutation performed');
  const identity: AutopilotIdentity = { repository: basePath, revision: process.env.GIT_COMMIT ?? 'unknown', plan: runId };
  const journal = new AutopilotJournal(path.join(basePath, '.agent', 'autopilot', `${runId}.jsonl`), identity);
  const session: SessionBoundary = sessionBoundary ?? { status: async () => { throw new Error('native session boundary integration unavailable'); }, continue: async () => { throw new Error('native session boundary integration unavailable'); } };
  const machine = new Autopilot(journal, session);
  if (action === 'start') return machine.start(value ?? runId);
  if (action === 'continue') return machine.continue();
  if (action === 'ci') return machine.ci((value ?? 'PENDING') as CiResult);
  if (action === 'checkpoint') return machine.checkpoint(value ?? 'manual');
  if (action === 'status') return journal.snapshot();
  throw new Error(`Unknown autopilot action: ${action}`);
}
