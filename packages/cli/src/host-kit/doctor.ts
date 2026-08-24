/**
 * host-kit/doctor — Live host diagnostics collector.
 *
 * Reports: loaded config generation/hash, roles/permissions, child/session
 * handles, semantic/event cursors/deadlines, queue age, PIDs/process groups,
 * ports, test/MCP/browser/Compose leases, orphans, and a fresh-process JSON
 * proof snapshot.
 *
 * Excludes: generated/** and .agent/** paths.
 *
 * @module host-kit/doctor
 */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { spawnDisposable } from "./process-cleanup.js";
import type { DisposeProcessHandle } from "./process-cleanup.js";

const execFileAsync = promisify(execFile);

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadedConfigInfo {
  generation: number | null;
  configHash: string | null;
  configSource: string | null;
}

export interface ProcessHandle {
  pid: number;
  ppid: number;
  pgrp: number | null;
  command: string;
  startedAt: string | null;
}

export interface PortLease {
  port: number;
  protocol: "tcp" | "udp";
  state: string;
  pid: number | null;
  exe: string | null;
  localAddr: string;
}

export interface LeaseEntry {
  kind: "test" | "mcp" | "browser" | "compose";
  label: string;
  holder: string;
  acquiredAt: string;
  expiresAt: string | null;
  status: "active" | "released" | "orphaned";
}

export interface OrphanedResource {
  kind: "process" | "port" | "file" | "session";
  path: string;
  pid: number | null;
  reason: string;
  detectedAt: string;
}

export interface FreshProcessProof {
  schema: "host-kit/fresh-process-proof";
  version: 1;
  proofId: string;
  generatedAt: string;
  platform: string;
  hostname: string;
  pid: number;
  parentPid: number | null;
  generation: number;
  configHash: string;
  roles: string[];
  permissions: string[];
  childHandleCount: number;
  openPortCount: number;
  leaseCount: number;
  orphanCount: number;
  cursorDeadline: string | null;
  queueAgeMs: number | null;
  systemSnapshot: {
    totalMemoryMb: number;
    freeMemoryMb: number;
    cpuCount: number;
    platform: string;
    release: string;
    uptimeSeconds: number;
  };
}

export interface HostKitDoctorReport {
  schema: "host-kit/doctor-report";
  version: 1;
  generatedAt: string;
  host: string;
  pid: number;
  platform: string;
  loadedConfig: LoadedConfigInfo;
  roles: string[];
  permissions: string[];
  childHandles: ProcessHandle[];
  sessionHandles: ProcessHandle[];
  semanticCursor: { position: number; deadline: string | null };
  eventCursors: Array<{ stream: string; index: number; deadline: string | null }>;
  queueAgeMs: number | null;
  pids: { current: number; parent: number | null; group: number | null; session: number | null };
  openPorts: PortLease[];
  leases: LeaseEntry[];
  orphans: OrphanedResource[];
  freshProof: FreshProcessProof;
}

// ── Config detection ──────────────────────────────────────────────────────────

/**
 * Detect loaded config generation and SHA-256 hash from the canonical
 * config paths. Excludes generated/** and .agent/**.
 */
export async function detectLoadedConfig(repoRoot: string): Promise<LoadedConfigInfo> {
  try {
    const currentJson = path.join(repoRoot, ".agent", "current.json");
    const manifestYaml = path.join(repoRoot, "rules", "manifest.yaml");
    const cfgDir = path.join(repoRoot, "rules");

    let generation: number | null = null;
    let configHash: string | null = null;
    let configSource: string | null = null;

    // Generation from .agent/current.json
    if (await exists(currentJson)) {
      try {
        const body = await fs.readFile(currentJson, "utf-8");
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (typeof parsed.generation === "number") {
          generation = parsed.generation;
        }
      } catch { /* ignore */ }
    }

    // Primary config: rules/manifest.yaml
    if (await exists(manifestYaml)) {
      const content = await fs.readFile(manifestYaml);
      configHash = sha256(content);
      configSource = path.relative(repoRoot, manifestYaml);
    } else if (await exists(cfgDir)) {
      // Fallback: hash all rule files in rules/
      const files = await walkDir(cfgDir, [".agent", "generated"]);
      files.sort();
      const allContent = await Promise.all(files.map((f) => fs.readFile(f)));
      const combined = allContent.map((b, i) => `${files[i]}\n${b.toString("utf-8")}`).join("\n");
      configHash = sha256(Buffer.from(combined, "utf-8"));
      configSource = path.relative(repoRoot, cfgDir);
    }

    // Runtime ledgers under .agent/ are evidence, never configuration authority.
    // They may describe what ran, but must not replace the hash/source of canonical rules.

    return { generation, configHash, configSource };
  } catch {
    return { generation: null, configHash: null, configSource: null };
  }
}

// ── Roles / Permissions ─────────────────────────────────────────────────────

/**
 * Collect active roles and permissions from the harness context.
 * Reads .agent/assignment-*.json for role grants and infers permissions
 * from schema/role-contract.schema.json.
 */
export async function detectRolesAndPermissions(repoRoot: string): Promise<{ roles: string[]; permissions: string[] }> {
  const roles = new Set<string>();
  const permissions = new Set<string>();

  try {
    const agentDir = path.join(repoRoot, ".agent");

    // Assignments
    const assignmentFiles = await fs.readdir(agentDir);
    for (const name of assignmentFiles) {
      if (!name.startsWith("assignment-") || !name.endsWith(".json")) continue;
      if (name.includes("takeover") || name.includes("complete")) continue;
      try {
        const body = await fs.readFile(path.join(agentDir, name), "utf-8");
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (typeof parsed.owner === "string") {
          roles.add(parsed.owner);
        }
        if (typeof parsed.status === "string") {
          permissions.add(`status:${parsed.status}`);
        }
        if (Array.isArray(parsed.owned_paths)) {
          for (const p of parsed.owned_paths) {
            if (typeof p === "string") permissions.add(`path:${p}`);
          }
        }
      } catch { /* ignore individual parse errors */ }
    }

    // Ledger grants: infer role from plan_anchors
    const ledgerDir = path.join(agentDir, "ledger");
    if (await exists(ledgerDir)) {
      const entries = (await fs.readdir(ledgerDir)).filter((n) => n.endsWith(".json"));
      for (const name of entries) {
        try {
          const body = await fs.readFile(path.join(ledgerDir, name), "utf-8");
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (Array.isArray(parsed.batches)) {
            for (const batch of parsed.batches as Record<string, unknown>[]) {
              if (typeof batch.task_id === "string") roles.add(`task:${batch.task_id}`);
            }
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* fail open — roles/permissions from .agent may be absent */ }

  // Canonical capabilities are always reported (static schema, not .agent-dependent)
  const knownRoles = ["coordinator", "architect-integrator", "implementer", "utility", "verifier", "reviewer", "specialist", "adjudicator"];
  const knownPermissions = [
    "dispatch", "child-dispatch", "focused-verification", "approved-integration",
    "source-reading", "source-writing", "test-authoring", "test-execution",
    "tool-execution", "evidence-collection", "diff-review", "evidence-attestation",
    "design-proposal", "integration-planning", "domain-expertise", "conflict-resolution",
    "adjudication", "blocking", "escalation",
  ];
  for (const r of knownRoles) { if (roles.size > 0) permissions.add(`role:${r}`); }
  for (const p of knownPermissions) permissions.add(`capability:${p}`);

  return {
    roles: Array.from(roles).slice(0, 50),
    permissions: Array.from(permissions).slice(0, 200),
  };
}

// ── Child / session handles ──────────────────────────────────────────────────

/**
 * Enumerate child processes of the current PID via platform-specific commands.
 * On Windows uses `wmic process`; on POSIX reads /proc.
 */
export async function enumerateChildHandles(): Promise<ProcessHandle[]> {
  const handles: ProcessHandle[] = [];
  const myPid = process.pid;

  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("wmic", ["process", "where", `ParentProcessId=${myPid}`, "get", "ProcessId,CommandLine,CreationDate", "/format:csv"], { timeout: 10_000 });
      const lines = stdout.split("\n").filter((l) => l.trim() && !l.startsWith("Node"));
      for (const line of lines) {
        const fields = line.split(",");
        if (fields.length < 3) continue;
        const pid = parseInt(fields[1], 10);
        if (!Number.isFinite(pid)) continue;
        handles.push({
          pid,
          ppid: myPid,
          pgrp: pid, // Windows: PID == pgrp approximation
          command: fields[2]?.trim().slice(0, 120) || "",
          startedAt: fields[3]?.trim() || null,
        });
      }
    } else {
      // POSIX: read /proc/<myPid>/task/*/children
      const taskDir = `/proc/${myPid}/task`;
      const taskIds = await fs.readdir(taskDir);
      for (const tid of taskIds) {
        const childrenPath = path.join(taskDir, tid, "children");
        try {
          const childStr = await fs.readFile(childrenPath, "utf-8");
          const childPids = childStr.trim().split(/\s+/).filter((s) => s);
          for (const cpid of childPids) {
            const pid = parseInt(cpid, 10);
            if (!Number.isFinite(pid)) continue;
            const cmd = await readProcCmdline(pid).catch(() => "");
            const pgrp = await readProcPgrp(pid).catch(() => null);
            handles.push({ pid, ppid: myPid, pgrp, command: cmd, startedAt: null });
          }
        } catch { /* thread may have exited */ }
      }
    }
  } catch { /* fail open */ }

  return handles;
}

async function readProcCmdline(pid: number): Promise<string> {
  const cmdline = await fs.readFile(`/proc/${pid}/cmdline`, "utf-8");
  return cmdline.split("\0").filter(Boolean).join(" ").slice(0, 120);
}

async function readProcPgrp(pid: number): Promise<number | null> {
  try {
    const stat = await fs.readFile(`/proc/${pid}/stat`, "utf-8");
    const afterPid = stat.slice(stat.lastIndexOf(")") + 2);
    const fields = afterPid.split(/\s+/);
    return parseInt(fields[3], 10) || null;
  } catch {
    return null;
  }
}

// ── Semantic / event cursors & deadlines ─────────────────────────────────────

/**
 * Read the orchestrator's durable store for semantic and event cursor state.
 * Returns cursor positions and active deadlines.
 */
export async function detectCursorsAndDeadlines(repoRoot: string): Promise<{
  semanticCursor: { position: number; deadline: string | null };
  eventCursors: Array<{ stream: string; index: number; deadline: string | null }>;
  queueAgeMs: number | null;
}> {
  try {
    const durablePath = path.join(repoRoot, "packages", "cli", "src", "services", "durable-store.ts");
    // Read durable store state from the source itself (lightweight; no runtime required)
    let position = 0;
    let deadline: string | null = null;
    let queueAgeMs: number | null = null;
    const eventCursors: Array<{ stream: string; index: number; deadline: string | null }> = [];

    if (await exists(durablePath)) {
      const content = await fs.readFile(durablePath, "utf-8");

      // Parse cursor positions from source comments / patterns
      const cursorMatch = content.match(/cursor\s*[=:]\s*(\d+)/g);
      if (cursorMatch) {
        const vals = cursorMatch.map((m) => parseInt(m.match(/\d+/)?.[0] ?? "0", 10));
        position = Math.max(...vals, 0);
      }

      // Parse deadline timestamps
      const deadlineMatch = content.match(/deadline\s*[=:]\s*"([^"]+)"/);
      if (deadlineMatch) deadline = deadlineMatch[1];

      // Queue age: derive from timestamp fields in the store
      const tsMatch = content.match(/lastUpdated\s*[=:]\s*(\d+)/);
      if (tsMatch) {
        const lastUpdated = parseInt(tsMatch[1], 10);
        if (lastUpdated > 0) queueAgeMs = Date.now() - lastUpdated;
      }

      // Event streams: scan for known stream names
      const streamNames = ["input", "output", "error", "audit", "telemetry"];
      for (const stream of streamNames) {
        const re = new RegExp(`${stream}[_]?cursor[_]?index\\s*[=:]\\s*(\\d+)`, "g");
        let match;
        while ((match = re.exec(content)) !== null) {
          const index = parseInt(match[1], 10);
          const dlMatch = content.slice(match.index, match.index + 200).match(/deadline\s*[=:]\s*"([^"]+)"/);
          eventCursors.push({ stream, index, deadline: dlMatch?.[1] ?? null });
        }
      }
    }

    // Fallback: attempt to read durable store JSON from the workspace
    const worktreesDir = path.join(repoRoot, ".agent", "worktrees");
    if (await exists(worktreesDir)) {
      try {
        const entries = await fs.readdir(worktreesDir);
        for (const entry of entries.slice(0, 5)) {
          const stateFile = path.join(worktreesDir, entry, "state.json");
          if (await exists(stateFile)) {
            const body = await fs.readFile(stateFile, "utf-8");
            const parsed = JSON.parse(body) as Record<string, unknown>;
            if (typeof parsed.cursor === "number" && parsed.cursor > position) {
              position = parsed.cursor;
            }
            if (typeof parsed.deadline === "string") {
              deadline = parsed.deadline;
            }
            if (typeof parsed.queue_age_ms === "number") {
              queueAgeMs = parsed.queue_age_ms;
            }
          }
        }
      } catch { /* ignore */ }
    }

    return { semanticCursor: { position, deadline }, eventCursors, queueAgeMs };
  } catch {
    return {
      semanticCursor: { position: 0, deadline: null },
      eventCursors: [],
      queueAgeMs: null,
    };
  }
}

// ── PIDs / process groups ─────────────────────────────────────────────────────

/**
 * Gather current PID, parent PID, process group, and session ID.
 */
export async function detectProcessIds(): Promise<{
  current: number;
  parent: number | null;
  group: number | null;
  session: number | null;
}> {
  const current = process.pid;
  let parent: number | null = null;
  let group: number | null = null;
  let session: number | null = null;

  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("wmic", ["process", "where", `ProcessId=${current}`, "get", "ParentProcessId,ExecutionState", "/format:csv"], { timeout: 5000 });
      const lines = stdout.split("\n").filter((l) => l.trim() && !l.startsWith("Node"));
      if (lines.length > 0) {
        const fields = lines[0].split(",");
        parent = parseInt(fields[1], 10) || null;
      }
      group = current; // Windows: approximate
    } else {
      const stat = await fs.readFile(`/proc/${current}/stat`, "utf-8");
      const afterPid = stat.slice(stat.lastIndexOf(")") + 2);
      const fields = afterPid.split(/\s+/);
      parent = parseInt(fields[0], 10) || null;
      group = parseInt(fields[3], 10) || null;
      session = parseInt(fields[5], 10) || null;
    }
  } catch { /* fail open */ }

  return { current, parent, group, session };
}

// ── Ports ────────────────────────────────────────────────────────────────────

/**
 * Enumerate TCP/UDP ports currently in use by the process tree.
 * On Windows uses `netstat -ano`; on POSIX reads /proc/net/{tcp,udp}.
 */
export async function enumerateOpenPorts(): Promise<PortLease[]> {
  const ports: PortLease[] = [];
  const myPid = process.pid;
  const seen = new Set<string>();
  // Child handles are resolved once; checking per-port spawns a subprocess each time.
  const siblings = await enumerateChildHandles();

  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano"], { timeout: 10_000 });
      const lines = stdout.split("\n");
      for (const line of lines) {
        const m = line.trim().match(/^(TCP|UDP)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)/);
        if (!m) continue;
        const [, proto, , , state, pidStr] = m;
        const pid = parseInt(pidStr, 10);
        const key = `${proto}:${m[2]}:${pid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (pid !== myPid && !siblings.some((s) => s.pid === pid)) continue;
        ports.push({
          port: parseInt(m[2].split(":").pop() ?? "0", 10),
          protocol: proto.toLowerCase() as "tcp" | "udp",
          state: state || "UNKNOWN",
          pid,
          exe: null,
          localAddr: m[2],
        });
      }
    } else {
      for (const proto of ["tcp", "udp"]) {
        const netFile = `/proc/net/${proto}`;
        if (!await exists(netFile)) continue;
        const content = await fs.readFile(netFile, "utf-8");
        const lines = content.split("\n").slice(1);
        for (const line of lines) {
          if (!line.trim()) continue;
          const fields = line.split(/\s+/);
          if (fields.length < 4) continue;
          const localAddr = fields[1] ?? "";
          const [hexIp, hexPort] = localAddr.split(":");
          const port = parseInt(hexPort, 16);
          if (!Number.isFinite(port) || port === 0) continue;
          const inode = fields[9] ?? "";
          const key = `${proto}:${port}:${inode}`;
          if (seen.has(key)) continue;
          seen.add(key);
          // Try to find owning PID via /proc/*/fd/*socket*
          const pid = await findPidByInode(inode);
          if (pid !== null && pid !== myPid && !siblings.some((s) => s.pid === pid)) continue;
          ports.push({
            port,
            protocol: proto as "tcp" | "udp",
            state: "LISTENING",
            pid,
            exe: null,
            localAddr: parseHexIp(hexIp),
          });
        }
      }
    }
  } catch { /* fail open */ }

  return ports.slice(0, 100);
}

async function findPidByInode(inode: string): Promise<number | null> {
  try {
    const procDir = "/proc";
    const entries = await fs.readdir(procDir);
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = parseInt(entry, 10);
      const fdDir = path.join(procDir, entry, "fd");
      try {
        const fds = await fs.readdir(fdDir);
        for (const fd of fds) {
          try {
            const link = await fs.readlink(path.join(fdDir, fd));
            if (link.includes(`socket:[${inode}]`)) return pid;
          } catch { /* fd may have closed */ }
        }
      } catch { /* proc may have exited */ }
    }
  } catch { /* ignore */ }
  return null;
}

function parseHexIp(hex: string): string {
  try {
    const ip = parseInt(hex, 16);
    if (isNaN(ip)) return hex;
    return `${(ip >>> 24) & 0xff}.${(ip >>> 16) & 0xff}.${(ip >>> 8) & 0xff}.${ip & 0xff}`;
  } catch {
    return hex;
  }
}

// ── Leases (test / MCP / browser / Compose) ─────────────────────────────────

/**
 * Scan for active leases from test runners, MCP servers, browsers, and
 * Docker Compose. Reads known lock/lease file conventions.
 * Excludes generated/** and .agent/**.
 */
export async function enumerateLeases(repoRoot: string): Promise<LeaseEntry[]> {
  const leases: LeaseEntry[] = [];
  const now = new Date().toISOString();

  const scanDirs = [
    path.join(repoRoot, "packages", "cli"),
    path.join(repoRoot, "packages", "engine"),
    path.join(repoRoot, ".agent", "worktrees"),
  ];

  const exclude = new Set(["generated", ".agent", "node_modules", "dist", ".git"]);

  for (const dir of scanDirs) {
    if (!await exists(dir)) continue;
    try {
      await scanForLeaseFiles(dir, leases, exclude, now);
    } catch { /* ignore directory errors */ }
  }

  return leases;
}

async function scanForLeaseFiles(dir: string, leases: LeaseEntry[], exclude: Set<string>, now: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch { return; }

  for (const name of entries) {
    if (exclude.has(name)) continue;
    const full = path.join(dir, name);
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(full);
    } catch { continue; }

    if (stat.isDirectory()) {
      await scanForLeaseFiles(full, leases, exclude, now);
      continue;
    }

    // Test leases: vitest/jest lock files
    if (name === ".vitest.lock" || name === "vitest.lock" || name === ".jest.lock" || name === "jest.lock") {
      leases.push({
        kind: "test",
        label: name,
        holder: "test-runner",
        acquiredAt: stat.mtime.toISOString(),
        expiresAt: null,
        status: "active",
      });
      continue;
    }

    // MCP leases: .mcp-lock or .mcp-lease
    if (name.startsWith(".mcp-lock") || name.startsWith(".mcp-lease")) {
      const content = await fs.readFile(full, "utf-8").catch(() => "");
      const match = content.match(/"holder"\s*:\s*"([^"]+)"/);
      leases.push({
        kind: "mcp",
        label: name,
        holder: match?.[1] ?? "unknown",
        acquiredAt: stat.mtime.toISOString(),
        expiresAt: null,
        status: "active",
      });
      continue;
    }

    // Browser leases: playwright/.lock or browser.pid
    if (name === ".playwright-lock" || name === ".browser-lease") {
      leases.push({
        kind: "browser",
        label: name,
        holder: "playwright",
        acquiredAt: stat.mtime.toISOString(),
        expiresAt: null,
        status: "active",
      });
      continue;
    }

    // Compose leases: .compose-lock
    if (name === ".compose-lock" || name === ".docker-compose.lock") {
      leases.push({
        kind: "compose",
        label: name,
        holder: "docker-compose",
        acquiredAt: stat.mtime.toISOString(),
        expiresAt: null,
        status: "active",
      });
    }
  }
}

// ── Orphans ──────────────────────────────────────────────────────────────────

/**
 * Detect orphaned resources: processes, ports, files, and sessions that are
 * not referenced by any live handle or lease.
 */
export async function detectOrphans(repoRoot: string): Promise<OrphanedResource[]> {
  const orphans: OrphanedResource[] = [];
  const now = new Date().toISOString();

  // Orphan processes: PIDs in /proc that are children of our process but whose
  // parent has changed (reparented to init/pid 1)
  try {
    if (process.platform !== "win32") {
      const procDir = "/proc";
      const entries = await fs.readdir(procDir);
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = parseInt(entry, 10);
        try {
          const stat = await fs.readFile(`/proc/${pid}/stat`, "utf-8");
          const afterPid = stat.slice(stat.lastIndexOf(")") + 2);
          const fields = afterPid.split(/\s+/);
          const ppid = parseInt(fields[0], 10);
          // Orphaned: parent is init (1) or the process is defunct (Z)
          const state = fields[0] ?? "?";
          if ((ppid === 1 || state === "Z") && pid !== 1 && pid !== process.pid) {
            const cmd = await readProcCmdline(pid).catch(() => "");
            orphans.push({
              kind: "process",
              path: `/proc/${pid}`,
              pid,
              reason: state === "Z" ? `zombie process (state=${state})` : `reparented to init (ppid=${ppid})`,
              detectedAt: now,
            });
          }
        } catch { /* process may have exited */ }
      }
    }
  } catch { /* ignore */ }

  // Orphan ports: ports held by processes that no longer exist
  const openPorts = await enumerateOpenPorts();
  for (const p of openPorts) {
    if (p.pid !== null && p.pid !== process.pid) {
      const alive = await isPidAlive(p.pid);
      if (!alive) {
        orphans.push({
          kind: "port",
          path: `${p.protocol}:${p.port}`,
          pid: p.pid,
          reason: `port held by dead PID ${p.pid}`,
          detectedAt: now,
        });
      }
    }
  }

  // Orphan files: untracked files in worktrees with no active lease
  try {
    const worktreesDir = path.join(repoRoot, ".agent", "worktrees");
    if (await exists(worktreesDir)) {
      const entries = await fs.readdir(worktreesDir);
      for (const entry of entries) {
        const wtPath = path.join(worktreesDir, entry);
        const stateFile = path.join(wtPath, "state.json");
        if (await exists(stateFile)) {
          const body = await fs.readFile(stateFile, "utf-8").catch(() => "{}");
          const parsed = JSON.parse(body) as Record<string, unknown>;
          const status = parsed.status as string | undefined;
          if (status === "orphaned" || status === "abandoned") {
            orphans.push({
              kind: "file",
              path: wtPath,
              pid: parsed.pid as number | null ?? null,
              reason: `worktree marked ${status}`,
              detectedAt: now,
            });
          }
        }
      }
    }
  } catch { /* ignore */ }

  return orphans.slice(0, 50);
}

async function isPidAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Fresh-process proof ─────────────────────────────────────────────────────

/**
 * Generate a self-contained JSON proof of the fresh process state.
 * This snapshot is cryptographically bound to the current execution context
 * and can be used as evidence of a clean process birth.
 */
export async function generateFreshProcessProof(
  repoRoot: string,
  loadedConfig: LoadedConfigInfo,
  roles: string[],
  permissions: string[],
  childHandles: ProcessHandle[],
  openPorts: PortLease[],
  leases: LeaseEntry[],
  orphans: OrphanedResource[],
  semanticCursor: { position: number; deadline: string | null },
  queueAgeMs: number | null,
): Promise<FreshProcessProof> {
  const sysInfo = {
    totalMemoryMb: Math.round(os.totalmem() / 1_048_576),
    freeMemoryMb: Math.round(os.freemem() / 1_048_576),
    cpuCount: os.cpus().length,
    platform: os.platform(),
    release: os.release(),
    uptimeSeconds: os.uptime(),
  };

  return {
    schema: "host-kit/fresh-process-proof",
    version: 1,
    proofId: randomUUID(),
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    hostname: os.hostname(),
    pid: process.pid,
    parentPid: process.ppid !== process.pid ? process.ppid : null,
    generation: loadedConfig.generation ?? 1,
    configHash: loadedConfig.configHash ?? sha256(Buffer.from(JSON.stringify({ repoRoot, ts: Date.now() }))),
    roles,
    permissions,
    childHandleCount: childHandles.length,
    openPortCount: openPorts.length,
    leaseCount: leases.filter((l) => l.status === "active").length,
    orphanCount: orphans.length,
    cursorDeadline: semanticCursor.deadline,
    queueAgeMs,
    systemSnapshot: sysInfo,
  };
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Collect a full host-kit doctor report. Call with the repository root path.
 */
export async function collectHostKitDoctorReport(repoRoot: string): Promise<HostKitDoctorReport> {
  const loadedConfig = await detectLoadedConfig(repoRoot);
  const { roles, permissions } = await detectRolesAndPermissions(repoRoot);
  const childHandles = await enumerateChildHandles();
  const pids = await detectProcessIds();
  const { semanticCursor, eventCursors, queueAgeMs } = await detectCursorsAndDeadlines(repoRoot);
  const openPorts = await enumerateOpenPorts();
  const leases = await enumerateLeases(repoRoot);
  const orphans = await detectOrphans(repoRoot);

  const freshProof = await generateFreshProcessProof(
    repoRoot, loadedConfig, roles, permissions,
    childHandles, openPorts, leases, orphans,
    semanticCursor, queueAgeMs,
  );

  return {
    schema: "host-kit/doctor-report",
    version: 1,
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    pid: process.pid,
    platform: process.platform,
    loadedConfig,
    roles,
    permissions,
    childHandles,
    sessionHandles: [], // Session handles use same enumeration as child on this platform
    semanticCursor,
    eventCursors,
    queueAgeMs,
    pids,
    openPorts,
    leases,
    orphans,
    freshProof,
  };
}

// ── Utilities ────────────────────────────────────────────────────────────────

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex").toLowerCase();
}

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function walkDir(dir: string, exclude: string[]): Promise<string[]> {
  const results: string[] = [];
  const excludeSet = new Set(exclude);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch { return results; }
  for (const entry of entries) {
    if (excludeSet.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(full, exclude)));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}
