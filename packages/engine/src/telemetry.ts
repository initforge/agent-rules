import fs from 'node:fs';
import path from 'node:path';

export type TelemetryEvent =
  | { kind: 'run_start'; runId: string; planId: string; host: string; model: string; effort: string }
  | { kind: 'agent_start'; agentId: string; role: string; model: string; tier: string }
  | { kind: 'task_start'; taskId: string; assignmentId: string }
  | { kind: 'tool_call'; tool: string; durationMs: number; success: boolean }
  | { kind: 'model_turn'; model: string; tokens: number; latencyMs: number; cost: number }
  | { kind: 'verification'; assignmentId: string; result: 'PASS' | 'FAIL' | 'PARTIAL' }
  | { kind: 'review'; reviewId: string; outcome: string }
  | { kind: 'handoff'; from: string; to: string; bundleHash: string }
  | { kind: 'run_end'; runId: string; totalTokens: number; totalCost: number; durationMs: number };

export interface TelemetryConfig {
  metadataRetentionDays: number;
  rawContentEnabled: boolean;
  rawContentRetentionDays: number;
  storageType: 'local' | 'otlp';
  otlpEndpoint?: string;
}

export const DEFAULT_CONFIG: TelemetryConfig = {
  metadataRetentionDays: 30,
  rawContentEnabled: false,
  rawContentRetentionDays: 7,
  storageType: 'local',
};

interface StoredEvent {
  event: TelemetryEvent;
  timestamp: string;
  metadataOnly: boolean;
}

export class TelemetryCollector {
  private events: StoredEvent[] = [];
  private flushed = false;
  private flushPromise: Promise<void> | null = null;
  private storagePath: string;

  constructor(
    public readonly config: TelemetryConfig,
    storagePath?: string,
  ) {
    this.validateConfig(config);
    this.storagePath = storagePath ?? path.join(process.cwd(), '.telemetry', 'events.jsonl');
  }

  private validateConfig(config: TelemetryConfig): void {
    if (!Number.isInteger(config.metadataRetentionDays) || config.metadataRetentionDays < 1) {
      throw new Error('metadataRetentionDays must be a positive integer');
    }
    if (config.rawContentEnabled) {
      if (!Number.isInteger(config.rawContentRetentionDays) || config.rawContentRetentionDays < 1) {
        throw new Error('rawContentRetentionDays must be a positive integer when raw content is enabled');
      }
    }
    if (config.storageType === 'otlp' && !config.otlpEndpoint) {
      throw new Error('otlpEndpoint is required when storageType is otlp');
    }
  }

  record(event: TelemetryEvent): void {
    this.events.push({
      event,
      timestamp: new Date().toISOString(),
      metadataOnly: !this.config.rawContentEnabled,
    });
  }

  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = (async () => {
      const dir = path.dirname(this.storagePath);
      fs.mkdirSync(dir, { recursive: true });

      const stream = fs.createWriteStream(this.storagePath, { flags: 'a' });
      for (const stored of this.events) {
        stream.write(JSON.stringify(stored) + '\n');
      }
      this.events = [];
      this.flushed = true;

      await new Promise<void>((resolve, reject) => {
        stream.end((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    })();

    return this.flushPromise;
  }

  async export(dest: string): Promise<void> {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });

    const allEvents = this.flushed
      ? this.readStoredEvents()
      : this.events.map((s) => s.event);

    fs.writeFileSync(dest, JSON.stringify(allEvents, null, 2), 'utf-8');
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let deleted = 0;

    if (fs.existsSync(this.storagePath)) {
      const content = fs.readFileSync(this.storagePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const remaining: string[] = [];

      for (const line of lines) {
        let keep = true;
        try {
          const parsed = JSON.parse(line) as StoredEvent;
          const eventTime = new Date(parsed.timestamp).getTime();
          if (!isNaN(eventTime) && eventTime < cutoff) {
            deleted++;
            keep = false;
          }
        } catch {
          keep = false;
          deleted++;
        }
        if (keep) remaining.push(line);
      }

      fs.writeFileSync(this.storagePath, remaining.join('\n') + (remaining.length > 0 ? '\n' : ''), 'utf-8');
    }

    this.events = this.events.filter((s) => {
      const eventTime = new Date(s.timestamp).getTime();
      return isNaN(eventTime) || eventTime >= cutoff;
    });

    return deleted;
  }

  private readStoredEvents(): TelemetryEvent[] {
    if (!fs.existsSync(this.storagePath)) return [];
    const content = fs.readFileSync(this.storagePath, 'utf-8');
    return content.trim().split('\n').filter(Boolean).map((line) => {
      const parsed = JSON.parse(line) as StoredEvent;
      return parsed.event;
    });
  }
}
