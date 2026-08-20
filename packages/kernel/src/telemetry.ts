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
  | { kind: 'attestation_collected'; host: string; commitSha: string; attestationType: 'native' | 'functional'; evidenceHash: string; verified: boolean }
  | { kind: 'run_end'; runId: string; totalTokens: number; totalCost: number; durationMs: number }
  /**
   * Emitted once per `live_verify` step the runner executes (a Playwright
   * run, a browser-script, an mcp-tool-call, a visual-diff). `evidence`
   * is a list of relative paths to the files the step produced — the
   * dashboard surfaces them so an operator can click through to a
   * screenshot or console log without leaving the run timeline.
   */
  | { kind: 'live_verify'; taskId: string; profileKind: string; result: 'PASS' | 'FAIL'; evidence: string[]; durationMs: number };

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

// Trust boundary: raw/prompt payload keys that must never enter telemetry events
const RAW_PAYLOAD_KEYS = new Set(['rawContent', 'rawPrompt', 'raw', 'prompt', 'messages', 'payload']);

// Attestation_collected field validators aligned with Python canonical schema (assertCertificationAttestation)
const COMMIT_SHA_RE = /^[0-9a-f]{40,64}$/i; // git SHA-1 or SHA-256
const SHA256_RE = /^[0-9a-f]{64}$/i; // content-addressed hash

function assertNoRawPayload(event: TelemetryEvent): void {
  for (const key of Object.keys(event)) {
    if (RAW_PAYLOAD_KEYS.has(key)) {
      throw new Error(`telemetry trust boundary: raw/prompt payload key '${key}' rejected`);
    }
  }
}

function assertAttestationCollectedShape(
  event: Extract<TelemetryEvent, { kind: 'attestation_collected' }>,
): void {
  if (typeof event.host !== 'string' || event.host.trim() === '') {
    throw new Error('attestation_collected: host is required non-empty string');
  }
  if (!COMMIT_SHA_RE.test(event.commitSha)) {
    throw new Error('attestation_collected: commitSha must be a git SHA (40-64 hex chars)');
  }
  if (event.attestationType !== 'native' && event.attestationType !== 'functional') {
    throw new Error("attestation_collected: attestationType must be 'native' or 'functional'");
  }
  if (typeof event.evidenceHash !== 'string' || !SHA256_RE.test(event.evidenceHash)) {
    throw new Error('attestation_collected: evidenceHash must be a SHA-256 (64 hex chars)');
  }
  if (typeof event.verified !== 'boolean') {
    throw new Error('attestation_collected: verified must be a boolean');
  }
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
    assertNoRawPayload(event);
    if (event.kind === 'attestation_collected') {
      assertAttestationCollectedShape(event);
    }
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
        stream.end((err: Error | null) => {
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
