import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Autopilot, AutopilotJournal } from '../src/autopilot.js';

describe('Autopilot continuation recovery', () => {
  it('does not duplicate a prompt after crash-after-prompt', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-'));
    const file = path.join(dir, 'run.jsonl');
    const identity = { repository: dir, revision: 'r1', plan: 'p1' };
    const journal = new AutopilotJournal(file, identity);
    const first = vi.fn(async () => undefined);
    const machine = new Autopilot(journal, { status: async () => 'idle', continue: first });
    machine.start('session-1');
    const started = journal.snapshot();
    journal.claim(started.continuationKey!, started.sessionId!);

    const recovered = await new Autopilot(new AutopilotJournal(file, identity), {
      status: async () => 'idle', continue: first,
    }).continue();

    expect(first).not.toHaveBeenCalled();
    expect(recovered.state).toBe('BLOCKED');
    expect(recovered.lastSeq).toBe(3);
  });
});
