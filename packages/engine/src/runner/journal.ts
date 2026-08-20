import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/**
 * Append-only, hash-chained journal.
 *
 * Extracted from `AutopilotJournal` (autopilot.ts), which had the right integrity
 * model buried in single lines several hundred characters wide and coupled to
 * autopilot-specific state. The chain is the part worth keeping: it is what makes a
 * receipt trustworthy after the process that wrote it is gone.
 *
 * Each record commits to its predecessor via `prevHash`, so a record cannot be
 * altered, reordered, or removed without `read()` throwing. This is the durable
 * memory the runner relies on: the runner itself holds no state between tasks.
 */

/** Identity every record in a journal must agree on. Mixing plans in one file is a bug. */
export interface JournalIdentity {
  repository: string;
  plan: string;
  revision: string;
}

export interface JournalRecord {
  seq: number;
  at: string;
  type: string;
  data?: Record<string, unknown>;
  identity: JournalIdentity;
  /** Hash of the previous record; 64 zeros for the first. */
  prevHash: string;
  hash: string;
  /** Idempotency key: appending the same eventId twice returns the existing record. */
  eventId: string;
}

const GENESIS_HASH = '0'.repeat(64);
const LOCK_TIMEOUT_MS = 5_000;

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Canonical form for hashing. Key order is insertion order, fixed by `recordBody`. */
const canonical = (value: unknown): string => JSON.stringify(value);

/** The exact field set that is hashed. Must match between write and verify. */
function hashableBody(record: JournalRecord): Record<string, unknown> {
  return {
    seq: record.seq,
    at: record.at,
    type: record.type,
    data: record.data,
    identity: record.identity,
    prevHash: record.prevHash,
    eventId: record.eventId,
  };
}

export class Journal {
  private readonly lockDir: string;

  constructor(
    readonly file: string,
    readonly identity: JournalIdentity,
    private readonly now: () => Date = () => new Date()
  ) {
    this.lockDir = `${file}.lock`;
    fs.mkdirSync(path.dirname(file), { recursive: true });

    // Refuse to append to a journal belonging to another plan/revision.
    //
    // Read only the first line, and tolerate a broken chain here: the constructor's
    // job is to catch "wrong plan", not to adjudicate integrity. A corrupt journal
    // must still be *openable* so `verify()` can report why — otherwise the only way
    // to diagnose a bad chain would be to catch a constructor throw.
    const firstIdentity = this.readFirstIdentity();
    if (firstIdentity && canonical(firstIdentity) !== canonical(identity)) {
      throw new Error(
        `journal identity mismatch: file belongs to ${canonical(firstIdentity)}, ` +
          `refusing to append as ${canonical(identity)}`
      );
    }
  }

  /** First record's identity, or null when the file is absent, empty, or unparseable. */
  private readFirstIdentity(): JournalIdentity | null {
    if (!fs.existsSync(this.file)) return null;
    const firstLine = fs.readFileSync(this.file, 'utf8').split('\n').find(Boolean);
    if (!firstLine) return null;
    try {
      return (JSON.parse(firstLine) as JournalRecord).identity ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Cross-process mutual exclusion via `mkdir`, which is atomic on POSIX and NTFS.
   * A lock file would race; a lock directory cannot be created twice.
   *
   * Stale lock recovery: if the lock directory is older than STALE_LOCK_MS
   * and the PID that created it is dead, break the lock.
   */
  private locked<T>(fn: () => T): T {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    const STALE_LOCK_MS = 60_000; // 1 minute
    for (;;) {
      try {
        fs.mkdirSync(this.lockDir);
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw err;

        // Check if lock is stale (older than threshold)
        try {
          const stat = fs.statSync(this.lockDir);
          const lockAge = Date.now() - stat.mtimeMs;
          if (lockAge > STALE_LOCK_MS) {
            // Lock is stale — break it
            fs.rmSync(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {
          // Lock dir disappeared between EEXIST and stat — retry
          continue;
        }

        if (Date.now() > deadline) {
          throw new Error(`journal is locked by another process: ${this.lockDir}`);
        }
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(this.lockDir, { recursive: true, force: true });
    }
  }

  /**
   * Append a record. Idempotent on `eventId` so a retried write after a crash does
   * not double-record.
   */
  append(type: string, data?: Record<string, unknown>, eventId: string = randomUUID()): JournalRecord {
    return this.locked(() => {
      const records = this.read();
      const prior = records.find((r) => r.eventId === eventId);
      if (prior) return prior;

      const body = {
        seq: (records.at(-1)?.seq ?? 0) + 1,
        at: this.now().toISOString(),
        type,
        data,
        identity: this.identity,
        prevHash: records.at(-1)?.hash ?? GENESIS_HASH,
        eventId: String(eventId),
      };
      const record: JournalRecord = { ...body, hash: sha256Hex(canonical(body)) };
      fs.appendFileSync(this.file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      return record;
    });
  }

  /**
   * Read and verify the whole chain. Throws on any break — a partial read would be
   * worse than no read, because callers would treat it as evidence.
   */
  read(): JournalRecord[] {
    if (!fs.existsSync(this.file)) return [];
    const out: JournalRecord[] = [];
    const lines = fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean);

    for (const [index, line] of lines.entries()) {
      let record: JournalRecord;
      try {
        record = JSON.parse(line) as JournalRecord;
      } catch {
        throw new Error(`journal record ${index + 1} is not valid JSON: ${this.file}`);
      }

      const expectedPrev = out.at(-1)?.hash ?? GENESIS_HASH;
      if (record.prevHash !== expectedPrev) {
        throw new Error(
          `journal chain broken at record ${index + 1}: prevHash ${record.prevHash} != ${expectedPrev}`
        );
      }
      if (record.hash !== sha256Hex(canonical(hashableBody(record)))) {
        throw new Error(`journal record ${index + 1} hash does not match its content (tampered)`);
      }
      out.push(record);
    }
    return out;
  }

  /** True when the chain verifies. For callers that want a check without a throw. */
  verify(): { ok: boolean; reason?: string; records: number } {
    try {
      const records = this.read();
      return { ok: true, records: records.length };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), records: 0 };
    }
  }

  /** Records of one type, oldest first. */
  ofType(type: string): JournalRecord[] {
    return this.read().filter((r) => r.type === type);
  }

  lastSeq(): number {
    return this.read().at(-1)?.seq ?? 0;
  }

  /**
   * Claim a unique key exactly once across processes. Returns false when already
   * claimed, which is how the runner avoids executing a task twice after a crash.
   */
  claim(key: string, data?: Record<string, unknown>): boolean {
    return this.locked(() => {
      const records = this.read();
      if (records.some((r) => r.type === 'CLAIM' && r.data?.key === key)) return false;

      const body = {
        seq: (records.at(-1)?.seq ?? 0) + 1,
        at: this.now().toISOString(),
        type: 'CLAIM',
        data: { ...data, key },
        identity: this.identity,
        prevHash: records.at(-1)?.hash ?? GENESIS_HASH,
        eventId: randomUUID(),
      };
      fs.appendFileSync(this.file, `${JSON.stringify({ ...body, hash: sha256Hex(canonical(body)) })}\n`, {
        mode: 0o600,
      });
      return true;
    });
  }
}
