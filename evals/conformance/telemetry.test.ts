import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelemetryCollector, DEFAULT_CONFIG } from '../../packages/engine/src/telemetry.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conformance-telemetry-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeCollector(dir: string): TelemetryCollector {
  return new TelemetryCollector({ ...DEFAULT_CONFIG }, path.join(dir, 'events.jsonl'));
}

describe('Conformance: Telemetry pipeline', () => {
  it('executes a full event pipeline: run_start -> agent_start -> task_start -> model_turn -> tool_call -> verification -> review -> handoff -> run_end', async () => {
    const dir = tmpDir();
    const collector = makeCollector(dir);

    collector.record({ kind: 'run_start', runId: 'r1', planId: 'p1', host: 'h1', model: 'm1', effort: 'high' });
    collector.record({ kind: 'agent_start', agentId: 'a1', role: 'worker', model: 'm1', tier: 'standard' });
    collector.record({ kind: 'task_start', taskId: 't1', assignmentId: 'a1' });
    collector.record({ kind: 'model_turn', model: 'm1', tokens: 500, latencyMs: 1200, cost: 0.02 });
    collector.record({ kind: 'tool_call', tool: 'read_file', durationMs: 150, success: true });
    collector.record({ kind: 'verification', assignmentId: 'a1', result: 'PASS' });
    collector.record({ kind: 'review', reviewId: 'rev1', outcome: 'approved' });
    collector.record({ kind: 'handoff', from: 'worker', to: 'reviewer', bundleHash: 'abc123' });
    collector.record({ kind: 'run_end', runId: 'r1', totalTokens: 500, totalCost: 0.02, durationMs: 30000 });

    await collector.flush();

    const content = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(9);
    const kinds = lines.map((l) => JSON.parse(l).event.kind);
    expect(kinds).toEqual([
      'run_start',
      'agent_start',
      'task_start',
      'model_turn',
      'tool_call',
      'verification',
      'review',
      'handoff',
      'run_end',
    ]);
  });

  it('aggregates cost correctly across events', () => {
    const dir = tmpDir();
    const collector = makeCollector(dir);

    collector.record({ kind: 'model_turn', model: 'm1', tokens: 100, latencyMs: 500, cost: 0.01 });
    collector.record({ kind: 'model_turn', model: 'm1', tokens: 200, latencyMs: 1000, cost: 0.02 });
    collector.record({ kind: 'model_turn', model: 'm2', tokens: 300, latencyMs: 1500, cost: 0.03 });
    collector.record({ kind: 'run_end', runId: 'r1', totalTokens: 600, totalCost: 0.06, durationMs: 10000 });

    const events = (collector as unknown as { events: Array<{ event: { kind: string; tokens?: number; cost?: number } }> }).events;
    const modelTurns = events.filter((s) => s.event.kind === 'model_turn');
    const totalCost = modelTurns.reduce((sum, s) => sum + (s.event.cost ?? 0), 0);
    const totalTokens = modelTurns.reduce((sum, s) => sum + (s.event.tokens ?? 0), 0);

    expect(totalCost).toBeCloseTo(0.06);
    expect(totalTokens).toBe(600);
  });

  it('tracks tokens across multiple model turns', () => {
    const dir = tmpDir();
    const collector = makeCollector(dir);

    collector.record({ kind: 'model_turn', model: 'm1', tokens: 150, latencyMs: 800, cost: 0.015 });
    collector.record({ kind: 'model_turn', model: 'm1', tokens: 250, latencyMs: 1200, cost: 0.025 });
    collector.record({ kind: 'model_turn', model: 'm1', tokens: 100, latencyMs: 400, cost: 0.01 });

    const events = (collector as unknown as { events: Array<{ event: { kind: string; tokens: number } }> }).events;
    const turnTokens = events.filter((s) => s.event.kind === 'model_turn').map((s) => s.event.tokens);
    expect(turnTokens).toEqual([150, 250, 100]);
    expect(turnTokens.reduce((a, b) => a + b, 0)).toBe(500);
  });

  it('enforces retention after config change', async () => {
    const dir = tmpDir();
    const storagePath = path.join(dir, 'events.jsonl');
    fs.mkdirSync(dir, { recursive: true });

    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const midDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();

    const event = { kind: 'run_start' as const, runId: 'r1', planId: 'p1', host: 'h1', model: 'm1', effort: 'high' };
    const lines = [
      JSON.stringify({ event, timestamp: oldDate, metadataOnly: true }),
      JSON.stringify({ event, timestamp: midDate, metadataOnly: true }),
      JSON.stringify({ event, timestamp: recentDate, metadataOnly: true }),
    ];
    fs.writeFileSync(storagePath, lines.join('\n') + '\n', 'utf-8');

    const collector = new TelemetryCollector(
      { ...DEFAULT_CONFIG, metadataRetentionDays: 15 },
      storagePath,
    );
    const deleted = await collector.deleteOlderThan(15);
    expect(deleted).toBe(1);

    const remaining = fs.readFileSync(storagePath, 'utf-8').trim().split('\n').filter(Boolean);
    expect(remaining).toHaveLength(2);
  });

  it('isolates namespaces across different runs', async () => {
    const dir = tmpDir();
    const collectorA = makeCollector(dir);
    const collectorB = makeCollector(dir);

    const storageA = path.join(dir, 'run-a.jsonl');
    const storageB = path.join(dir, 'run-b.jsonl');

    const collector1 = new TelemetryCollector({ ...DEFAULT_CONFIG }, storageA);
    const collector2 = new TelemetryCollector({ ...DEFAULT_CONFIG }, storageB);

    collector1.record({ kind: 'run_start', runId: 'run-a', planId: 'plan-a', host: 'h1', model: 'm1', effort: 'high' });
    collector1.record({ kind: 'run_end', runId: 'run-a', totalTokens: 100, totalCost: 0.01, durationMs: 5000 });

    collector2.record({ kind: 'run_start', runId: 'run-b', planId: 'plan-b', host: 'h2', model: 'm2', effort: 'low' });
    collector2.record({ kind: 'run_end', runId: 'run-b', totalTokens: 200, totalCost: 0.02, durationMs: 10000 });

    await Promise.all([collector1.flush(), collector2.flush()]);

    const eventsA = fs.readFileSync(storageA, 'utf-8').trim().split('\n').filter(Boolean);
    const eventsB = fs.readFileSync(storageB, 'utf-8').trim().split('\n').filter(Boolean);

    expect(eventsA).toHaveLength(2);
    expect(eventsB).toHaveLength(2);

    for (const line of eventsA) {
      const parsed = JSON.parse(line);
      expect(parsed.event.runId).toBe('run-a');
    }
    for (const line of eventsB) {
      const parsed = JSON.parse(line);
      expect(parsed.event.runId).toBe('run-b');
    }
  });
});
