import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type HeartbeatPhase = 'worker' | 'verification';
export type HeartbeatStatus = 'RUNNING' | 'SOFT_DEADLINE' | 'COMPLETED' | 'TIMED_OUT' | 'FAILED';

export interface HeartbeatRecord {
  schema: 'agent-rules/task-heartbeat@1';
  task_id: string;
  attempt: number;
  phase: HeartbeatPhase;
  status: HeartbeatStatus;
  started_at: string;
  heartbeat_at: string;
  soft_deadline_at: string;
  hard_deadline_at: string;
  host: string;
  platform: NodeJS.Platform;
  execution_class?: string;
  reason?: string;
}

export class TaskHeartbeat {
  private timer: NodeJS.Timeout | undefined;
  private record: HeartbeatRecord;

  constructor(
    private readonly file: string,
    input: { taskId: string; attempt: number; phase: HeartbeatPhase; softTimeoutMs: number; hardTimeoutMs: number; intervalMs: number; executionClass?: string },
  ) {
    const started = Date.now();
    this.record = {
      schema: 'agent-rules/task-heartbeat@1',
      task_id: input.taskId,
      attempt: input.attempt,
      phase: input.phase,
      status: 'RUNNING',
      started_at: new Date(started).toISOString(),
      heartbeat_at: new Date(started).toISOString(),
      soft_deadline_at: new Date(started + input.softTimeoutMs).toISOString(),
      hard_deadline_at: new Date(started + input.hardTimeoutMs).toISOString(),
      host: os.hostname(),
      platform: process.platform,
      ...(input.executionClass ? { execution_class: input.executionClass } : {}),
    };
    this.intervalMs = Math.max(250, input.intervalMs);
  }

  private readonly intervalMs: number;

  start(): void {
    this.write();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  private tick(): void {
    const now = Date.now();
    if (this.record.status === 'RUNNING' && now >= Date.parse(this.record.soft_deadline_at)) this.record.status = 'SOFT_DEADLINE';
    this.record.heartbeat_at = new Date(now).toISOString();
    this.write();
  }

  phase(phase: HeartbeatPhase, softTimeoutMs: number, hardTimeoutMs: number, executionClass?: string): void {
    this.record.phase = phase;
    this.record.status = 'RUNNING';
    const now = Date.now();
    this.record.started_at = new Date(now).toISOString();
    this.record.heartbeat_at = new Date(now).toISOString();
    this.record.soft_deadline_at = new Date(now + softTimeoutMs).toISOString();
    this.record.hard_deadline_at = new Date(now + hardTimeoutMs).toISOString();
    if (executionClass) this.record.execution_class = executionClass;
    this.write();
  }

  finish(status: Exclude<HeartbeatStatus, 'RUNNING' | 'SOFT_DEADLINE'>, reason?: string): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.record.status = status;
    this.record.heartbeat_at = new Date().toISOString();
    if (reason) this.record.reason = reason;
    this.write();
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(this.record, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
}
