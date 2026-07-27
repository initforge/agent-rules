import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TelemetryCollector, DEFAULT_CONFIG, type TelemetryConfig } from '../src/telemetry.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('TelemetryCollector', () => {
  describe('record', () => {
    it('records events in order', () => {
      const dir = tmpDir();
      const collector = new TelemetryCollector({ ...DEFAULT_CONFIG }, path.join(dir, 'events.jsonl'));

      collector.record({ kind: 'run_start', runId: 'r1', planId: 'p1', host: 'h1', model: 'm1', effort: 'high' });
      collector.record({ kind: 'task_start', taskId: 't1', assignmentId: 'a1' });
      collector.record({ kind: 'run_end', runId: 'r1', totalTokens: 100, totalCost: 0.5, durationMs: 5000 });

      const events = (collector as unknown as { events: Array<{ event: unknown }> }).events;
      expect(events).toHaveLength(3);
      expect(events[0].event).toMatchObject({ kind: 'run_start', runId: 'r1' });
      expect(events[1].event).toMatchObject({ kind: 'task_start', taskId: 't1' });
      expect(events[2].event).toMatchObject({ kind: 'run_end', runId: 'r1' });
    });
  });

  describe('flush', () => {
    it('writes events to storage', async () => {
      const dir = tmpDir();
      const storagePath = path.join(dir, 'events.jsonl');
      const collector = new TelemetryCollector({ ...DEFAULT_CONFIG }, storagePath);

      collector.record({ kind: 'run_start', runId: 'r1', planId: 'p1', host: 'h1', model: 'm1', effort: 'high' });
      collector.record({ kind: 'agent_start', agentId: 'a1', role: 'worker', model: 'm1', tier: 'standard' });

      await collector.flush();

      expect(fs.existsSync(storagePath)).toBe(true);
      const content = fs.readFileSync(storagePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
      const firstEvent = JSON.parse(lines[0]);
      expect(firstEvent.event.kind).toBe('run_start');
    });
  });

  describe('export', () => {
    it('writes to specified path', async () => {
      const dir = tmpDir();
      const collector = new TelemetryCollector({ ...DEFAULT_CONFIG }, path.join(dir, 'events.jsonl'));

      collector.record({ kind: 'run_start', runId: 'r1', planId: 'p1', host: 'h1', model: 'm1', effort: 'high' });
      collector.record({ kind: 'run_end', runId: 'r1', totalTokens: 100, totalCost: 0.5, durationMs: 5000 });

      const exportPath = path.join(dir, 'export.json');
      await collector.export(exportPath);

      expect(fs.existsSync(exportPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(content).toHaveLength(2);
      expect(content[0].kind).toBe('run_start');
    });
  });

  describe('deleteOlderThan', () => {
    it('respects retention days', async () => {
      const dir = tmpDir();
      const storagePath = path.join(dir, 'events.jsonl');
      const collector = new TelemetryCollector({ ...DEFAULT_CONFIG }, storagePath);

      fs.mkdirSync(path.dirname(storagePath), { recursive: true });

      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const recentEvent = { kind: 'run_start' as const, runId: 'r1', planId: 'p1', host: 'h1', model: 'm1', effort: 'high' };

      const oldLine = JSON.stringify({ event: recentEvent, timestamp: oldDate, metadataOnly: true });
      const recentLine = JSON.stringify({ event: recentEvent, timestamp: new Date().toISOString(), metadataOnly: true });
      fs.writeFileSync(storagePath, oldLine + '\n' + recentLine + '\n', 'utf-8');

      const deleted = await collector.deleteOlderThan(7);

      expect(deleted).toBe(1);
      const remaining = fs.readFileSync(storagePath, 'utf-8').trim().split('\n').filter(Boolean);
      expect(remaining).toHaveLength(1);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('has correct defaults', () => {
      expect(DEFAULT_CONFIG.metadataRetentionDays).toBe(30);
      expect(DEFAULT_CONFIG.rawContentEnabled).toBe(false);
      expect(DEFAULT_CONFIG.storageType).toBe('local');
      expect(DEFAULT_CONFIG.otlpEndpoint).toBeUndefined();
    });
  });

  describe('rawContentEnabled', () => {
    it('enables raw content collection', () => {
      const collector = new TelemetryCollector({
        ...DEFAULT_CONFIG,
        rawContentEnabled: true,
        rawContentRetentionDays: 14,
      });

      const events = (collector as unknown as { events: Array<{ metadataOnly: boolean }> }).events;
      collector.record({ kind: 'run_start', runId: 'r1', planId: 'p1', host: 'h1', model: 'm1', effort: 'high' });

      expect(events[0].metadataOnly).toBe(false);
    });
  });

  describe('config validation', () => {
    it('rejects invalid metadata retention', () => {
      expect(() => new TelemetryCollector({ ...DEFAULT_CONFIG, metadataRetentionDays: 0 })).toThrow();
      expect(() => new TelemetryCollector({ ...DEFAULT_CONFIG, metadataRetentionDays: -1 })).toThrow();
    });

    it('rejects invalid raw content retention when enabled', () => {
      expect(() => new TelemetryCollector({
        ...DEFAULT_CONFIG, rawContentEnabled: true, rawContentRetentionDays: 0,
      })).toThrow();
    });

    it('rejects otlp without endpoint', () => {
      expect(() => new TelemetryCollector({
        ...DEFAULT_CONFIG, storageType: 'otlp',
      })).toThrow();
    });

    it('accepts valid otlp config', () => {
      const collector = new TelemetryCollector({
        ...DEFAULT_CONFIG, storageType: 'otlp', otlpEndpoint: 'http://localhost:4318',
      });
      expect(collector.config.storageType).toBe('otlp');
    });
  });
});
