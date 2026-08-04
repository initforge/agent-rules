/**
 * Safe Improvement Lifecycle (SS-21)
 * 
 * Bounded implementation:
 * - Explicit typed functions for version management
 * - Promotion/rollback with receipts
 * - Audit trail for all version transitions
 * 
 * Limitations:
 * - No automated testing before promotion (add when test-gate schema exists)
 * - No staged rollouts (add when rollout-strategy config exists)
 * - Single-instance only (add when distributed coordination available)
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

export type ImprovementStage = "development" | "staging" | "production" | "archived";
export type ImprovementStatus = "active" | "superseded" | "rolled_back" | "failed";

export interface ImprovementVersion {
  id: string;
  name: string;
  stage: ImprovementStage;
  status: ImprovementStatus;
  version: string; // semver
  changelog: string;
  artifacts: ImprovementArtifact[];
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  promotedAt?: string;
  promotedBy?: string;
  supersededBy?: string; // tracks which improvement superseded this one
}

/** Supersession graph: maps superseded_id -> superseding_id */
export interface SupersessionGraph {
  schema: "agent-rules/supersession-graph";
  version: 1;
  edges: Array<{ from: string; to: string }>; // from=superseded, to=superseding
}

export interface ImprovementArtifact {
  path: string;
  sha256: string;
  size: number;
}

export interface PromotionReceipt {
  schema: "agent-rules/improvement-promotion-receipt";
  version: 1;
  improvementId: string;
  fromStage: ImprovementStage;
  toStage: ImprovementStage;
  versionString: string;
  timestamp: string;
  checksum: string;
  promotedBy?: string;
}

export interface RollbackReceipt {
  schema: "agent-rules/improvement-rollback-receipt";
  version: 1;
  improvementId: string;
  fromStage: ImprovementStage;
  toStage: ImprovementStage;
  targetVersion: string;
  timestamp: string;
  reason: string;
  checksum: string;
  rolledBackBy?: string;
}

export interface ImprovementAuditEntry {
  schema: "agent-rules/improvement-audit";
  version: 1;
  entries: (PromotionReceipt | RollbackReceipt)[];
  timestamp: string;
}

export interface ImprovementListResult {
  improvements: ImprovementVersion[];
  byStage: Record<ImprovementStage, string[]>;
}

export interface HistoryEntry {
  schema: "agent-rules/improvement-history";
  version: 1;
  improvementId: string;
  event: "created" | "promoted" | "rolled_back" | "archived" | "superseded";
  fromStage?: ImprovementStage;
  toStage: ImprovementStage;
  toStatus?: ImprovementStatus;
  timestamp: string;
  reason?: string;
  by?: string;
}

/** Compute SHA-256 checksum */
function checksum(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** ISO timestamp helper */
function now(): string {
  return new Date().toISOString();
}

/** Compute artifact checksum from file */
export function computeArtifactChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/** Paths */
function improvementsDir(basePath: string): string {
  return path.join(basePath, ".agent", "improvements");
}

function improvementDir(basePath: string, id: string): string {
  return path.join(improvementsDir(basePath), id);
}

function improvementFile(basePath: string, id: string): string {
  return path.join(improvementDir(basePath, id), "improvement.json");
}

function auditFile(basePath: string): string {
  return path.join(improvementsDir(basePath), "audit.jsonl");
}

function historyFile(basePath: string, id: string): string {
  return path.join(improvementDir(basePath, id), "history.jsonl");
}

function stageIndexFile(basePath: string, stage: ImprovementStage): string {
  return path.join(improvementsDir(basePath), `index-${stage}.json`);
}

/** Ensure directory exists */
function ensureImprovementDir(basePath: string, id: string): void {
  fs.mkdirSync(improvementDir(basePath, id), { recursive: true });
}

/** Append to audit log */
function appendAudit(basePath: string, entry: PromotionReceipt | RollbackReceipt): void {
  fs.mkdirSync(improvementsDir(basePath), { recursive: true });
  fs.appendFileSync(auditFile(basePath), JSON.stringify(entry) + "\n", "utf-8");
}

/** Append to per-improvement history */
function appendHistory(basePath: string, id: string, entry: Omit<HistoryEntry, "schema" | "version" | "improvementId" | "timestamp">): void {
  ensureImprovementDir(basePath, id);
  const record: HistoryEntry = {
    schema: "agent-rules/improvement-history",
    version: 1,
    improvementId: id,
    timestamp: now(),
    ...entry,
  };
  fs.appendFileSync(historyFile(basePath, id), JSON.stringify(record) + "\n", "utf-8");
}

/** Load improvement history */
export function loadImprovementHistory(basePath: string, id: string): HistoryEntry[] {
  const fp = historyFile(basePath, id);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, "utf-8");
  return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as HistoryEntry);
}

/** Supersession graph file */
function supersessionGraphFile(basePath: string): string {
  return path.join(improvementsDir(basePath), "supersession-graph.json");
}

/** Load supersession graph */
export function loadSupersessionGraph(basePath: string): SupersessionGraph {
  const fp = supersessionGraphFile(basePath);
  if (!fs.existsSync(fp)) return { schema: "agent-rules/supersession-graph", version: 1, edges: [] };
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as SupersessionGraph;
}

/** Save supersession graph */
function saveSupersessionGraph(basePath: string, graph: SupersessionGraph): void {
  fs.mkdirSync(improvementsDir(basePath), { recursive: true });
  fs.writeFileSync(supersessionGraphFile(basePath), JSON.stringify(graph, null, 2), "utf-8");
}

/** Detect cycles in supersession graph.
 *  Returns array of cycle descriptions if cycles found, empty array otherwise.
 *  A cycle means: A superseded B, B superseded C, ... Z superseded A.
 *  This is invalid because we can't determine canonical lineage. */
export function detectSupersessionCycles(basePath: string): string[] {
  const graph = loadSupersessionGraph(basePath);
  const cycles: string[] = [];

  // Build adjacency list: from -> [to, to, ...]
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string, path: string[]): boolean {
    visited.add(id);
    inStack.add(id);
    const neighbors = adj.get(id) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        if (dfs(next, [...path, next])) return true;
      } else if (inStack.has(next)) {
        const cycleStart = path.indexOf(next);
        const cyclePath = cycleStart >= 0 ? path.slice(cycleStart).join(" -> ") + " -> " + next : `${id} -> ${next} -> ${id}`;
        cycles.push(`Supersession cycle detected: ${cyclePath}`);
        return true;
      }
    }
    inStack.delete(id);
    return false;
  }

  // Check all nodes including orphans (nodes that were superseded but superseded nothing)
  const allNodes = new Set(graph.edges.flatMap(e => [e.from, e.to]));
  const improvements = listImprovements(basePath).improvements;
  for (const imp of improvements) {
    if (imp.status === "superseded") allNodes.add(imp.id);
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }

  return cycles;
}

/** Check if promoting would create a supersession cycle.
 *  Returns null if safe, error message if it would create a cycle. */
function checkPromotionCycle(basePath: string, newId: string): string | null {
  // Build what the new graph would look like
  const graph = loadSupersessionGraph(basePath);
  const improvements = listImprovements(basePath).improvements;

  // Find all currently-production improvements that would be superseded
  const toSupersede = improvements.filter(
    i => i.stage === "production" && i.status === "active" && i.id !== newId
  );

  // Simulate adding edges: toSupersede[i] -> newId
  // Check if this would create a cycle by checking if newId can reach any toSupersede
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }

  // If newId already appears as a superseded node (in edges.from), and any toSupersede
  // can reach newId, then adding newId -> toSupersede creates a cycle
  // Actually: if newId was superseded by X, and we're making newId supersede Y,
  // that would mean X superseded newId, and newId supersedes Y, so Y superseded X - cycle!

  // More precisely: check if there's a path from newId to any toSupersede[i]
  // If yes, adding edge newId->toSupersede[i] creates a cycle
  const visited = new Set<string>();
  function canReach(from: string, target: string): boolean {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    const neighbors = adj.get(from) ?? [];
    for (const n of neighbors) {
      if (canReach(n, target)) return true;
    }
    return false;
  }

  for (const superseded of toSupersede) {
    if (canReach(newId, superseded.id)) {
      return `Promotion would create supersession cycle: ${newId} would supersede ${superseded.id}, but ${superseded.id} can reach ${newId}`;
    }
  }

  return null;
}

/** Update stage index for fast lookup */
function updateStageIndex(basePath: string, id: string, fromStage: ImprovementStage, toStage: ImprovementStage): void {
  // Note: "archived" is managed by archiveImprovement, not included in promotion indexes
  const stages: ImprovementStage[] = ["development", "staging", "production"];
  
  for (const stage of stages) {
    const indexPath = stageIndexFile(basePath, stage);
    let index: string[] = [];
    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as string[];
    }
    
    if (stage === fromStage) {
      index = index.filter((i) => i !== id);
    }
    if (stage === toStage && !index.includes(id)) {
      index.push(id);
    }
    
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
  }
}

/** Load improvement from disk */
function loadImprovement(basePath: string, id: string): ImprovementVersion | null {
  const fp = improvementFile(basePath, id);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as ImprovementVersion;
}

/** Persist improvement to disk */
function persistImprovement(basePath: string, improvement: ImprovementVersion): void {
  ensureImprovementDir(basePath, improvement.id);
  fs.writeFileSync(improvementFile(basePath, improvement.id), JSON.stringify(improvement, null, 2), "utf-8");
}

/** Create a new improvement */
export function createImprovement(
  basePath: string,
  name: string,
  version: string,
  changelog: string,
  artifacts: ImprovementArtifact[],
  metadata: Record<string, string> = {},
  createdBy?: string
): ImprovementVersion {
  const id = randomUUID();
  const improvement: ImprovementVersion = {
    id,
    name,
    stage: "development",
    status: "active",
    version,
    changelog,
    artifacts,
    metadata: {
      ...metadata,
      createdBy: createdBy ?? "unknown",
      checksum: checksum({ name, version, artifacts }),
    },
    createdAt: now(),
    updatedAt: now(),
  };
  
  ensureImprovementDir(basePath, id);
  fs.writeFileSync(improvementFile(basePath, id), JSON.stringify(improvement, null, 2), "utf-8");
  updateStageIndex(basePath, improvement.id, "development", "development");
  appendHistory(basePath, id, {
    event: "created",
    toStage: "development",
    toStatus: "active",
    by: createdBy,
  });
  
  return improvement;
}

/** Get improvement by ID */
export function getImprovement(basePath: string, id: string): ImprovementVersion | null {
  return loadImprovement(basePath, id);
}

/** List all improvements */
export function listImprovements(basePath: string): ImprovementListResult {
  const dir = improvementsDir(basePath);
  if (!fs.existsSync(dir)) return { improvements: [], byStage: { development: [], staging: [], production: [], archived: [] } };
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const improvements: ImprovementVersion[] = [];
  const byStage: Record<ImprovementStage, string[]> = {
    development: [],
    staging: [],
    production: [],
    archived: [],
  };
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const improvement = loadImprovement(basePath, entry.name);
    if (improvement) {
      improvements.push(improvement);
      if (!byStage[improvement.stage].includes(improvement.id)) {
        byStage[improvement.stage].push(improvement.id);
      }
    }
  }
  
  return { improvements, byStage };
}

/** Get improvements by stage */
export function getImprovementsByStage(basePath: string, stage: ImprovementStage): ImprovementVersion[] {
  const { improvements } = listImprovements(basePath);
  return improvements.filter((i) => i.stage === stage && i.status === "active");
}

/** Promote improvement to next stage */
export function promoteImprovement(
  basePath: string,
  id: string,
  reason?: string,
  promotedBy?: string
): { success: boolean; improvement?: ImprovementVersion; receipt?: PromotionReceipt; error?: string } {
  const improvement = loadImprovement(basePath, id);
  if (!improvement) return { success: false, error: `improvement not found: ${id}` };

  // "archived" is set by archiveImprovement(), not by promotion
  const stageOrder: ImprovementStage[] = ["development", "staging", "production"];
  const currentIndex = stageOrder.indexOf(improvement.stage);

  if (currentIndex === -1 || currentIndex >= stageOrder.length - 1) {
    return { success: false, error: `cannot promote from stage: ${improvement.stage}` };
  }

  const fromStage = improvement.stage;
  const toStage = stageOrder[currentIndex + 1];

  // If promoting to production, check for cycle and mark previous production version as superseded
  if (toStage === "production") {
    // Check if this promotion would create a cycle
    const cycleError = checkPromotionCycle(basePath, id);
    if (cycleError) {
      return { success: false, error: cycleError };
    }

    const currentProduction = getImprovementsByStage(basePath, "production");
    const graph = loadSupersessionGraph(basePath);
    const newEdges: Array<{ from: string; to: string }> = [];

    for (const prod of currentProduction) {
      if (prod.id !== id) {
        prod.status = "superseded";
        prod.supersededBy = id; // track explicit supersession
        prod.updatedAt = now();
        fs.writeFileSync(improvementFile(basePath, prod.id), JSON.stringify(prod, null, 2), "utf-8");
        appendHistory(basePath, prod.id, {
          event: "superseded",
          toStage: "production",
          toStatus: "superseded",
          reason: `superseded by ${improvement.id}`,
        });
        newEdges.push({ from: prod.id, to: id });
      }
    }

    // Add supersession edges to graph
    if (newEdges.length > 0) {
      graph.edges.push(...newEdges);
      saveSupersessionGraph(basePath, graph);
    }
  }

  improvement.stage = toStage;
  improvement.status = "active";
  improvement.updatedAt = now();
  improvement.promotedAt = now();
  improvement.promotedBy = promotedBy;
  
  if (reason) {
    improvement.changelog += `\n\n[promotion] ${reason}`;
  }
  
  const receipt: PromotionReceipt = {
    schema: "agent-rules/improvement-promotion-receipt",
    version: 1,
    improvementId: id,
    fromStage,
    toStage,
    versionString: improvement.version,
    timestamp: now(),
    checksum: checksum({ id, fromStage, toStage, version: improvement.version }),
    promotedBy,
  };
  
  persistImprovement(basePath, improvement);
  updateStageIndex(basePath, id, fromStage, toStage);
  appendAudit(basePath, receipt);
  appendHistory(basePath, id, {
    event: "promoted",
    fromStage,
    toStage,
    toStatus: "active",
    by: promotedBy,
  });
  
  return { success: true, improvement, receipt };
}

/** Rollback improvement to previous stage */
export function rollbackImprovement(
  basePath: string,
  id: string,
  reason: string,
  rolledBackBy?: string
): { success: boolean; improvement?: ImprovementVersion; restoredFromId?: string; receipt?: RollbackReceipt; error?: string } {
  const improvement = loadImprovement(basePath, id);
  if (!improvement) return { success: false, error: `improvement not found: ${id}` };
  
  // "archived" is not in the promotion order — rollback targets are: production→staging→development
  const stageOrder: ImprovementStage[] = ["development", "staging", "production"];
  const currentIndex = stageOrder.indexOf(improvement.stage);
  
  if (currentIndex <= 0) {
    return { success: false, error: `cannot rollback from stage: ${improvement.stage}` };
  }
  
  const fromStage = improvement.stage;
  const toStage = stageOrder[currentIndex - 1];
  let restoredFromId: string | undefined;
  
  // Real rollback: if rolling back from production, restore the previously superseded
  // production version so it becomes active again.
  if (fromStage === "production") {
    const superseded = listImprovements(basePath).improvements
      .filter((i) => i.stage === "production" && i.status === "superseded")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (superseded.length > 0) {
      const restored = superseded[0];
      restored.stage = "production";
      restored.status = "active";
      restored.updatedAt = now();
      fs.writeFileSync(improvementFile(basePath, restored.id), JSON.stringify(restored, null, 2), "utf-8");
      appendHistory(basePath, restored.id, {
        event: "promoted",
        fromStage: "production",
        toStage: "production",
        toStatus: "active",
        reason: `restored via rollback of ${id}`,
        by: rolledBackBy,
      });
      restoredFromId = restored.id;
    }
  }
  
  improvement.stage = toStage;
  improvement.status = "rolled_back";
  improvement.updatedAt = now();
  improvement.changelog += `\n\n[rollback] ${reason}`;
  
  const receipt: RollbackReceipt = {
    schema: "agent-rules/improvement-rollback-receipt",
    version: 1,
    improvementId: id,
    fromStage,
    toStage,
    targetVersion: improvement.version,
    timestamp: now(),
    reason,
    checksum: checksum({ id, fromStage, toStage, version: improvement.version, reason }),
    rolledBackBy,
  };
  
  persistImprovement(basePath, improvement);
  updateStageIndex(basePath, id, fromStage, toStage);
  appendAudit(basePath, receipt);
  appendHistory(basePath, id, {
    event: "rolled_back",
    fromStage,
    toStage,
    toStatus: "rolled_back",
    reason,
    by: rolledBackBy,
  });
  
  return { success: true, improvement, restoredFromId, receipt };
}

/** Archive an improvement */
export function archiveImprovement(
  basePath: string,
  id: string,
  reason?: string
): { success: boolean; improvement?: ImprovementVersion; error?: string } {
  const improvement = loadImprovement(basePath, id);
  if (!improvement) return { success: false, error: `improvement not found: ${id}` };
  
  const fromStage = improvement.stage;
  improvement.stage = "archived";
  improvement.status = improvement.status === "active" ? "superseded" : improvement.status;
  improvement.updatedAt = now();
  
  if (reason) {
    improvement.changelog += `\n\n[archived] ${reason}`;
  }
  
  persistImprovement(basePath, improvement);
  updateStageIndex(basePath, improvement.id, fromStage, "archived");
  appendHistory(basePath, improvement.id, {
    event: "archived",
    fromStage,
    toStage: "archived",
    toStatus: improvement.status,
    reason,
  });
  
  return { success: true, improvement };
}

/** Load audit log */
export function loadImprovementAudit(basePath: string, lastN?: number): (PromotionReceipt | RollbackReceipt)[] {
  const fp = auditFile(basePath);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line) as PromotionReceipt | RollbackReceipt);
  return lastN ? entries.slice(-lastN) : entries;
}

/** Verify improvement integrity */
export function verifyImprovementIntegrity(
  basePath: string,
  id: string
): { valid: boolean; improvement?: ImprovementVersion; error?: string } {
  const improvement = loadImprovement(basePath, id);
  if (!improvement) return { valid: false, error: "improvement not found" };
  
  const expectedChecksum = improvement.metadata.checksum;
  const actualChecksum = checksum({
    name: improvement.name,
    version: improvement.version,
    artifacts: improvement.artifacts,
  });
  
  if (expectedChecksum !== actualChecksum) {
    return { valid: false, improvement, error: "checksum mismatch — possible tampering" };
  }
  
  return { valid: true, improvement };
}
