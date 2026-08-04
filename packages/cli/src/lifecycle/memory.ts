/**
 * Knowledge/Memory Lifecycle (SS-20)
 * 
 * Bounded implementation:
 * - Explicit typed functions for store/retrieve/list/evict
 * - Persistence via JSON files in .agent/memory/
 * - Receipt/audit via append-only audit log
 * 
 * Limitations:
 * - No TTL/expiration (add when eviction-policy configured)
 * - No search/query (add when memory index schema exists)
 * - No cross-instance sync (add when distributed store available)
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

export interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface MemoryReceipt {
  schema: "agent-rules/memory-receipt";
  version: 1;
  entryId: string;
  operation: "store" | "update" | "evict";
  timestamp: string;
  checksum: string;
}

export interface MemoryAuditEntry {
  schema: "agent-rules/memory-audit";
  version: 1;
  receipts: MemoryReceipt[];
  compactedAt?: string;
}

export interface MemoryStats {
  entryCount: number;
  totalBytes: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

/** Compute SHA-256 checksum for integrity verification */
function checksum(entry: MemoryEntry): string {
  const payload = JSON.stringify({ key: entry.key, value: entry.value, version: entry.version });
  return createHash("sha256").update(payload).digest("hex");
}

/** ISO timestamp helper */
function now(): string {
  return new Date().toISOString();
}

/** Paths */
function memoryDir(basePath: string): string {
  return path.join(basePath, ".agent", "memory");
}

function entriesDir(basePath: string): string {
  return path.join(memoryDir(basePath), "entries");
}

function auditFile(basePath: string): string {
  return path.join(memoryDir(basePath), "audit.jsonl");
}

/** Ensure directory structure exists */
function ensureMemoryDir(basePath: string): void {
  fs.mkdirSync(entriesDir(basePath), { recursive: true });
}

/** Append receipt to audit log (append-only for compliance) */
function appendAuditReceipt(basePath: string, receipt: MemoryReceipt): void {
  ensureMemoryDir(basePath);
  const line = JSON.stringify(receipt) + "\n";
  fs.appendFileSync(auditFile(basePath), line, "utf-8");
}

/** Load audit log for a given window (last N entries, or all) */
export function loadAuditLog(basePath: string, lastN?: number): MemoryReceipt[] {
  const fp = auditFile(basePath);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const receipts = lines.map((line) => JSON.parse(line) as MemoryReceipt);
  return lastN ? receipts.slice(-lastN) : receipts;
}

/** Persist entry to disk */
function persistEntry(basePath: string, entry: MemoryEntry): void {
  const fp = path.join(entriesDir(basePath), `${entry.id}.json`);
  fs.writeFileSync(fp, JSON.stringify(entry, null, 2), "utf-8");
}

/** Load entry from disk */
function loadEntry(basePath: string, id: string): MemoryEntry | null {
  const fp = path.join(entriesDir(basePath), `${id}.json`);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as MemoryEntry;
}

/** Remove entry from disk */
function removeEntry(basePath: string, id: string): void {
  const fp = path.join(entriesDir(basePath), `${id}.json`);
  if (fs.existsSync(fp)) fs.rmSync(fp);
}

/** Store a new memory entry */
export function storeMemory(
  basePath: string,
  key: string,
  value: unknown,
  metadata: Record<string, string> = {}
): MemoryEntry {
  ensureMemoryDir(basePath);
  const id = randomUUID();
  const entry: MemoryEntry = {
    id,
    key,
    value,
    metadata,
    createdAt: now(),
    updatedAt: now(),
    version: 1,
  };
  entry.metadata.sha256 = checksum(entry);
  persistEntry(basePath, entry);
  const receipt: MemoryReceipt = {
    schema: "agent-rules/memory-receipt",
    version: 1,
    entryId: id,
    operation: "store",
    timestamp: now(),
    checksum: checksum(entry),
  };
  appendAuditReceipt(basePath, receipt);
  return entry;
}

/** Update an existing memory entry */
export function updateMemory(
  basePath: string,
  id: string,
  value: unknown,
  metadata?: Record<string, string>
): MemoryEntry | null {
  const existing = loadEntry(basePath, id);
  if (!existing) return null;
  const updated: MemoryEntry = {
    ...existing,
    value,
    metadata: { ...existing.metadata, ...metadata },
    updatedAt: now(),
    version: existing.version + 1,
  };
  updated.metadata.sha256 = checksum(updated);
  persistEntry(basePath, updated);
  const receipt: MemoryReceipt = {
    schema: "agent-rules/memory-receipt",
    version: 1,
    entryId: id,
    operation: "update",
    timestamp: now(),
    checksum: checksum(updated),
  };
  appendAuditReceipt(basePath, receipt);
  return updated;
}

/** Evict (delete) a memory entry */
export function evictMemory(basePath: string, id: string): boolean {
  const existing = loadEntry(basePath, id);
  if (!existing) return false;
  removeEntry(basePath, id);
  const receipt: MemoryReceipt = {
    schema: "agent-rules/memory-receipt",
    version: 1,
    entryId: id,
    operation: "evict",
    timestamp: now(),
    checksum: existing.metadata.sha256 ?? "",
  };
  appendAuditReceipt(basePath, receipt);
  return true;
}

/** Retrieve a memory entry by ID */
export function getMemory(basePath: string, id: string): MemoryEntry | null {
  return loadEntry(basePath, id);
}

/** List all memory entries */
export function listMemory(basePath: string): MemoryEntry[] {
  const dir = entriesDir(basePath);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const content = fs.readFileSync(path.join(dir, f), "utf-8");
    return JSON.parse(content) as MemoryEntry;
  });
}

/** Get memory statistics */
export function getMemoryStats(basePath: string): MemoryStats {
  const entries = listMemory(basePath);
  if (entries.length === 0) {
    return { entryCount: 0, totalBytes: 0, oldestEntry: null, newestEntry: null };
  }
  const timestamps = entries.map((e) => e.createdAt);
  const sizes = entries.map((e) => JSON.stringify(e).length);
  return {
    entryCount: entries.length,
    totalBytes: sizes.reduce((a, b) => a + b, 0),
    oldestEntry: timestamps.reduce((a, b) => (a < b ? a : b)),
    newestEntry: timestamps.reduce((a, b) => (a > b ? a : b)),
  };
}

/** Verify integrity of a memory entry */
export function verifyMemoryIntegrity(basePath: string, id: string): { valid: boolean; entry?: MemoryEntry; error?: string } {
  const entry = loadEntry(basePath, id);
  if (!entry) return { valid: false, error: "entry not found" };
  const expectedChecksum = entry.metadata.sha256;
  const actualChecksum = checksum(entry);
  if (expectedChecksum !== actualChecksum) {
    return { valid: false, entry, error: "checksum mismatch — possible tampering" };
  }
  return { valid: true, entry };
}

/** Compact audit log (remove duplicates, keep last for each entry operation) */
export function compactAuditLog(basePath: string): { compacted: number; remaining: number } {
  const receipts = loadAuditLog(basePath);
  if (receipts.length === 0) return { compacted: 0, remaining: 0 };
  
  // Keep last receipt per entry per operation type
  const seen = new Map<string, MemoryReceipt>();
  for (let i = receipts.length - 1; i >= 0; i--) {
    const r = receipts[i];
    const key = `${r.entryId}:${r.operation}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  
  const compacted = receipts.length - seen.size;
  const remaining = Array.from(seen.values()).reverse();
  
  // Write compacted log
  const fp = auditFile(basePath);
  const content = remaining.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(fp, content, "utf-8");
  
  // Record compaction in audit
  const auditEntry: MemoryAuditEntry = {
    schema: "agent-rules/memory-audit",
    version: 1,
    receipts: [],
    compactedAt: now(),
  };
  fs.appendFileSync(fp, JSON.stringify(auditEntry) + "\n", "utf-8");
  
  return { compacted, remaining: remaining.length };
}
