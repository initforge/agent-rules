import crypto from "node:crypto";
import type { RequirementLedger, RequirementSourceSpan } from "./requirement-ledger.js";
import type { PlannerContract } from "./planner.js";
import type { WorkRequest } from "./protocol.js";

export type ConsequenceClass =
  | "BEHAVIOR"
  | "ARCHITECTURE"
  | "AUTHORITY"
  | "PERSISTENCE"
  | "DATA_CONTRACT"
  | "SECURITY"
  | "CONCURRENCY"
  | "RETRY_IDEMPOTENCY"
  | "COMPATIBILITY"
  | "MIGRATION_RECOVERY"
  | "EXTERNAL_EFFECT"
  | "COMPLETION";

export type DecisionClosureState =
  | "CLOSED"
  | "BOUNDED_BY_POLICY"
  | "NOT_APPLICABLE_WITH_EVIDENCE"
  | "NEEDS_USER"
  | "BLOCKED_BY_UNKNOWN"
  | "UNKNOWN_NOT_ANALYZED";

export interface DecisionRequirement {
  decision_id: string; // e.g. "DEC-001"
  consequence_class: ConsequenceClass;
  why_required: string;
  source_requirement_ids: string[];
  source_span?: RequirementSourceSpan;
  affected_domains: string[];
  known_alternatives?: Array<{ option: string; reason_rejected?: string }>;
  discoverable_with_evidence: boolean;
  closure_state: DecisionClosureState;
  closed_decision?: string;
  required_authority: "planner" | "user" | "policy";
  evidence_bindings?: Record<string, string>;
  verification_implications?: string[];
}

export interface DecisionEnvelopePolicyClause {
  rule_id: string;
  consequence_class: ConsequenceClass;
  surface: string; // e.g. "filesystem:db/*", "api:routes/*", "network:outgoing", "auth:permissions"
  target_matcher: string; // glob or regex pattern
  policy: "ALLOW" | "DENY" | "ESCALATE";
  decision_id?: string;
  evidence_binding?: string;
  explanation: string;
}

export interface DecisionEnvelope {
  schema: "agent-rules/decision-envelope/v1";
  version: 1;
  envelope_sha256: string;
  spec_id: string;
  spec_revision: number;
  task_id: string;
  clauses: DecisionEnvelopePolicyClause[];
  locked_decisions: Array<{
    decision_id: string;
    consequence_class: ConsequenceClass;
    statement: string;
  }>;
  allowed_local_freedom: string[];
  bounded_alternatives?: Array<{
    decision_id: string;
    allowed_options: string[];
  }>;
  forbidden_inferences: string[];
  escalation_triggers: string[];
  evidence_bindings: Record<string, string>;
}

export type WorkerAutonomyProfile = "LOCAL_ONLY" | "BOUNDED" | "PLANNER_CAPABLE";

export interface DecisionConflictReceipt {
  schema: "agent-rules/decision-conflict-receipt/v1";
  version: 1;
  receipt_sha256: string;
  work_id: string;
  spec_id: string;
  spec_revision: number;
  task_id: string;
  decision_id?: string;
  consequence_class: ConsequenceClass;
  discovered_fact: string;
  conflicting_locked_decision?: string;
  suggested_patch_scope: string[];
  status: "PLAN_AMENDMENT_REQUIRED";
  emitted_at: string;
}

export interface DecisionClosureAnalysisResult {
  schema: "agent-rules/decision-closure-analysis/v1";
  version: 1;
  passed: boolean;
  decision_requirements: DecisionRequirement[];
  unclosed_decisions: DecisionRequirement[];
  blocking_decisions: DecisionRequirement[];
  analysis_sha256: string;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// Structural risk patterns across consequence classes
const CONSEQUENCE_DETECTORS: Array<{
  consequence_class: ConsequenceClass;
  pattern: RegExp;
  why_required: string;
  suggested_domain: string;
}> = [
  {
    consequence_class: "PERSISTENCE",
    pattern: /\b(persist|database|store|sql|sqlite|postgres|redis|storage|table|migration|schema|cache\s+store)\b/i,
    why_required: "State persistence, store authority, and schema lifecycle must be explicitly closed.",
    suggested_domain: "backend",
  },
  {
    consequence_class: "RETRY_IDEMPOTENCY",
    pattern: /\b(retry|retries|backoff|idempotent|idempotency|rate\s+limit|poll\s+loop)\b/i,
    why_required: "Retry trigger conditions, backoff bounds, and mutation idempotency keys must be closed.",
    suggested_domain: "backend",
  },
  {
    consequence_class: "SECURITY",
    pattern: /\b(auth|login|token|jwt|permission|rbac|secret|credential|password|access\s+control)\b/i,
    why_required: "Authentication mechanism and authorization boundaries must be explicitly defined.",
    suggested_domain: "security",
  },
  {
    consequence_class: "DATA_CONTRACT",
    pattern: /\b(api|endpoint|route|json\s+schema|dto|graphql|payload|contract\s+change|breaking\s+change)\b/i,
    why_required: "Public interface and serialization contract must be strictly bound.",
    suggested_domain: "backend",
  },
  {
    consequence_class: "CONCURRENCY",
    pattern: /\b(concurrent|parallel|mutex|lock|race|atomic|thread|worker\s+pool|synchronize)\b/i,
    why_required: "Ordering, locking, and synchronization semantics must be closed.",
    suggested_domain: "backend",
  },
  {
    consequence_class: "COMPATIBILITY",
    pattern: /\b(backward|deprecate|legacy|upgrade|migration\s+path|versioning)\b/i,
    why_required: "Backward compatibility expectations and migration paths must be specified.",
    suggested_domain: "general",
  },
  {
    consequence_class: "MIGRATION_RECOVERY",
    pattern: /\b(rollback|recovery|backup|snapshot|disaster|repair\s+transaction)\b/i,
    why_required: "Recovery and rollback boundaries must be defined.",
    suggested_domain: "infra",
  },
  {
    consequence_class: "EXTERNAL_EFFECT",
    pattern: /\b(webhook|email|sms|stripe|third[- ]party|external\s+service|http\s+post|network\s+call)\b/i,
    why_required: "External side-effects and third-party call boundaries must be closed.",
    suggested_domain: "backend",
  },
];

/**
 * Derives candidate DecisionRequirements using progressive disclosure:
 * 1. Structural risk detection on raw intent & RequirementLedger
 * 2. Cross-referencing against plan decisions & explicit unknowns
 * 3. Matching concrete evidence bindings
 */
export function analyzeDecisionClosure(
  request: WorkRequest,
  ledger: RequirementLedger,
  contract: PlannerContract
): DecisionClosureAnalysisResult {
  const decisionRequirements: DecisionRequirement[] = [];
  const planDecisions = contract.decisions ?? [];
  const planUnresolved = contract.unresolved ?? [];
  const planRequiresUser = contract.requires_user ?? [];

  // Parse existing structured or text decisions from contract
  const closedDecisionMap = new Map<string, string>();
  for (const dec of planDecisions) {
    closedDecisionMap.set(dec, dec);
  }

  let decCounter = 1;

  // Progressive derivation: for each requirement item and intent span
  for (const item of ledger.items) {
    const combinedText = `${item.text} ${request.raw_intent}`;
    for (const detector of CONSEQUENCE_DETECTORS) {
      if (detector.pattern.test(combinedText)) {
        const decId = `DEC-${String(decCounter++).padStart(3, "0")}`;

        // Check if there is an explicit plan decision matching this consequence class
        const matchingDecision = planDecisions.find((d) =>
          detector.pattern.test(d) || d.toLowerCase().includes(detector.consequence_class.toLowerCase())
        );

        const matchingUnresolved = planUnresolved.find((u) =>
          detector.pattern.test(u) || u.toLowerCase().includes(detector.consequence_class.toLowerCase())
        );

        const matchingRequiresUser = planRequiresUser.find((u) =>
          detector.pattern.test(u) || u.toLowerCase().includes(detector.consequence_class.toLowerCase())
        );

        let closureState: DecisionClosureState = "BLOCKED_BY_UNKNOWN";
        let closedDecisionText: string | undefined;

        if (matchingRequiresUser) {
          closureState = "NEEDS_USER";
        } else if (matchingUnresolved) {
          closureState = "BLOCKED_BY_UNKNOWN";
        } else if (matchingDecision) {
          closureState = "CLOSED";
          closedDecisionText = matchingDecision;
        } else if (!item.mandatory) {
          closureState = "NOT_APPLICABLE_WITH_EVIDENCE";
        }

        decisionRequirements.push({
          decision_id: decId,
          consequence_class: detector.consequence_class,
          why_required: detector.why_required,
          source_requirement_ids: [item.id],
          source_span: item.source_span,
          affected_domains: [detector.suggested_domain],
          discoverable_with_evidence: true,
          closure_state: closureState,
          closed_decision: closedDecisionText,
          required_authority: closureState === "NEEDS_USER" ? "user" : "planner",
          evidence_bindings: closedDecisionText ? { decision: closedDecisionText } : undefined,
        });
      }
    }
  }

  // Deduplicate by consequence class + source requirement
  const uniqueRequirements: DecisionRequirement[] = [];
  const seenKeys = new Set<string>();
  for (const dr of decisionRequirements) {
    const key = `${dr.consequence_class}:${dr.source_requirement_ids.join(",")}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueRequirements.push(dr);
    }
  }

  const unclosed = uniqueRequirements.filter(
    (dr) => dr.closure_state === "BLOCKED_BY_UNKNOWN" || dr.closure_state === "UNKNOWN_NOT_ANALYZED"
  );
  const blocking = uniqueRequirements.filter(
    (dr) => dr.closure_state === "NEEDS_USER" || dr.closure_state === "BLOCKED_BY_UNKNOWN"
  );

  const passed = unclosed.length === 0 && blocking.length === 0;

  const analysisSha = sha256(
    JSON.stringify({
      work_id: request.work_id,
      requirements: uniqueRequirements.map((r) => ({ id: r.decision_id, state: r.closure_state })),
      passed,
    })
  );

  return {
    schema: "agent-rules/decision-closure-analysis/v1",
    version: 1,
    passed,
    decision_requirements: uniqueRequirements,
    unclosed_decisions: unclosed,
    blocking_decisions: blocking,
    analysis_sha256: analysisSha,
  };
}

/**
 * Compiles a machine-enforceable DecisionEnvelope for a given task.
 */
export function compileDecisionEnvelope(params: {
  specId: string;
  specRevision: number;
  taskId: string;
  decisionRequirements: DecisionRequirement[];
  ownedPaths: string[];
  forbiddenPaths?: string[];
  allowedFreedom?: string[];
  forbiddenInferences?: string[];
}): DecisionEnvelope {
  const clauses: DecisionEnvelopePolicyClause[] = [];
  const lockedDecisions: Array<{
    decision_id: string;
    consequence_class: ConsequenceClass;
    statement: string;
  }> = [];

  let ruleCounter = 1;

  // Clause 1: Default allow owned paths for local implementation
  for (const owned of params.ownedPaths) {
    clauses.push({
      rule_id: `RULE-${String(ruleCounter++).padStart(3, "0")}`,
      consequence_class: "BEHAVIOR",
      surface: "filesystem",
      target_matcher: owned.endsWith("*") ? owned : `${owned}/**`,
      policy: "ALLOW",
      explanation: `Allow local implementation changes inside owned scope: ${owned}`,
    });
  }

  // Clause 2: Explicitly deny forbidden paths
  for (const forbidden of params.forbiddenPaths ?? []) {
    clauses.push({
      rule_id: `RULE-${String(ruleCounter++).padStart(3, "0")}`,
      consequence_class: "AUTHORITY",
      surface: "filesystem",
      target_matcher: forbidden.endsWith("*") ? forbidden : `${forbidden}/**`,
      policy: "DENY",
      explanation: `Deny changes inside forbidden scope: ${forbidden}`,
    });
  }

  // Clause 3: Guard sensitive surfaces based on closed decisions
  for (const dr of params.decisionRequirements) {
    if (dr.closure_state === "CLOSED" && dr.closed_decision) {
      lockedDecisions.push({
        decision_id: dr.decision_id,
        consequence_class: dr.consequence_class,
        statement: dr.closed_decision,
      });

      if (dr.consequence_class === "PERSISTENCE") {
        clauses.push({
          rule_id: `RULE-${String(ruleCounter++).padStart(3, "0")}`,
          consequence_class: "PERSISTENCE",
          surface: "persistence:storage",
          target_matcher: "db/**|migrations/**|prisma/**|*.sql",
          policy: "ALLOW",
          decision_id: dr.decision_id,
          explanation: `Persistence modifications locked to decision: ${dr.closed_decision}`,
        });
      } else if (dr.consequence_class === "DATA_CONTRACT") {
        clauses.push({
          rule_id: `RULE-${String(ruleCounter++).padStart(3, "0")}`,
          consequence_class: "DATA_CONTRACT",
          surface: "api:schema",
          target_matcher: "api/**|routes/**|schemas/**",
          policy: "ALLOW",
          decision_id: dr.decision_id,
          explanation: `API contract modifications locked to decision: ${dr.closed_decision}`,
        });
      }
    } else if (dr.closure_state === "NEEDS_USER" || dr.closure_state === "BLOCKED_BY_UNKNOWN") {
      clauses.push({
        rule_id: `RULE-${String(ruleCounter++).padStart(3, "0")}`,
        consequence_class: dr.consequence_class,
        surface: `${dr.consequence_class.toLowerCase()}:*`,
        target_matcher: "**",
        policy: "ESCALATE",
        decision_id: dr.decision_id,
        explanation: `Consequential decision ${dr.decision_id} is unclosed; mutation must escalate.`,
      });
    }
  }

  const allowedLocalFreedom = params.allowedFreedom ?? [
    "local variable naming",
    "helper function decomposition",
    "equivalent idiomatic library syntax",
    "code formatting and style",
    "unit test structure and mock organization",
    "internal documentation and comments",
  ];

  const forbiddenInferences = params.forbiddenInferences ?? [
    "silently choosing a new persistence authority or storage backend",
    "inventing business behavior not defined in the frozen plan",
    "introducing unclosed retry or rate-limiting loops on mutation endpoints",
    "modifying authentication or authorization boundaries without locked decision",
    "introducing breaking changes to public APIs or schemas",
    "weakening verification scripts or test assertions to manufacture PASS",
  ];

  const escalationTriggers = [
    "discovering source facts that conflict with a locked decision",
    "requiring an unlisted third-party external network service",
    "discovering unresolvable schema drift on an owned boundary",
    "hitting an unclosed concurrency ordering constraint",
  ];

  const envelopeContent = JSON.stringify({
    specId: params.specId,
    specRevision: params.specRevision,
    taskId: params.taskId,
    clauses,
    lockedDecisions,
    allowedLocalFreedom,
  });

  return {
    schema: "agent-rules/decision-envelope/v1",
    version: 1,
    envelope_sha256: sha256(envelopeContent),
    spec_id: params.specId,
    spec_revision: params.specRevision,
    task_id: params.taskId,
    clauses,
    locked_decisions: lockedDecisions,
    allowed_local_freedom: allowedLocalFreedom,
    forbidden_inferences: forbiddenInferences,
    escalation_triggers: escalationTriggers,
    evidence_bindings: {},
  };
}

/**
 * Fast structured pre-effect check to determine if a proposed action or file edit
 * is allowed inside the DecisionEnvelope.
 */
export function evaluateDecisionPreEffect(
  envelope: DecisionEnvelope,
  targetPath: string,
  effectKind: "read" | "filesystem_mutation" | "command_execution" | "network" | "destructive"
): { allowed: boolean; policy: "ALLOW" | "DENY" | "ESCALATE"; reason?: string; clause?: DecisionEnvelopePolicyClause } {
  // Read operations are always safe
  if (effectKind === "read") {
    return { allowed: true, policy: "ALLOW" };
  }

  const normalizedPath = targetPath.replace(/\\/g, "/");

  // Check structured clauses in order
  for (const clause of envelope.clauses) {
    if (clause.policy === "DENY") {
      const match = matchesMatcher(normalizedPath, clause.target_matcher);
      if (match) {
        return {
          allowed: false,
          policy: "DENY",
          reason: `Action on ${targetPath} denied by clause ${clause.rule_id}: ${clause.explanation}`,
          clause,
        };
      }
    }
  }

  for (const clause of envelope.clauses) {
    if (clause.policy === "ESCALATE") {
      const match = matchesMatcher(normalizedPath, clause.target_matcher);
      if (match) {
        return {
          allowed: false,
          policy: "ESCALATE",
          reason: `Action on ${targetPath} requires escalation under clause ${clause.rule_id}: ${clause.explanation}`,
          clause,
        };
      }
    }
  }

  for (const clause of envelope.clauses) {
    if (clause.policy === "ALLOW") {
      const match = matchesMatcher(normalizedPath, clause.target_matcher);
      if (match) {
        return { allowed: true, policy: "ALLOW", clause };
      }
    }
  }

  // Default: if inside owned scope, allow as local implementation; otherwise escalate
  return {
    allowed: false,
    policy: "ESCALATE",
    reason: `Target path ${targetPath} does not match any ALLOW clause in the DecisionEnvelope`,
  };
}

function matchesMatcher(target: string, matcher: string): boolean {
  if (matcher === "**") return true;
  const parts = matcher.split("|");
  for (const part of parts) {
    const clean = part.trim().replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
    const regex = new RegExp(`^${clean}$`, "i");
    if (regex.test(target)) return true;
  }
  return false;
}

/**
 * Post-effect audit: verifies that changes made by the worker do not violate locked decisions,
 * even if unit tests pass.
 */
export function evaluateDecisionPostEffect(
  envelope: DecisionEnvelope,
  filesChanged: string[],
  diffText: string
): { passed: boolean; violations: string[]; conflict?: DecisionConflictReceipt } {
  const violations: string[] = [];

  for (const clause of envelope.clauses) {
    if (clause.policy === "DENY") {
      for (const file of filesChanged) {
        const normalized = file.replace(/\\/g, "/");
        if (matchesMatcher(normalized, clause.target_matcher)) {
          violations.push(`Modified forbidden surface: ${file} (violated clause ${clause.rule_id})`);
        }
      }
    }
  }

  // Detect persistence backend invention or divergence from locked decision
  const introducesStoreMatch = diffText.match(/\b(new\s+Redis|mongoose\.connect|sqlite3\.Database|createClient|new\s+Pool)\b/i);
  if (introducesStoreMatch) {
    const matchedToken = introducesStoreMatch[1].toLowerCase();
    const persistenceLocked = envelope.locked_decisions.find((d) => d.consequence_class === "PERSISTENCE");
    if (!persistenceLocked) {
      violations.push(`Worker introduced a new persistent storage connection (${matchedToken}) without an approved persistence decision`);
    } else {
      const approvedText = (persistenceLocked.statement ?? (persistenceLocked as any).decision ?? '').toLowerCase();
      if (approvedText.includes("sqlite") && (matchedToken.includes("redis") || matchedToken.includes("pool") || matchedToken.includes("mongoose"))) {
        violations.push(`Worker introduced unapproved persistent store (${matchedToken}) conflicting with locked decision: ${persistenceLocked.statement}`);
      } else if (approvedText.includes("redis") && (matchedToken.includes("sqlite") || matchedToken.includes("pool") || matchedToken.includes("mongoose"))) {
        violations.push(`Worker introduced unapproved persistent store (${matchedToken}) conflicting with locked decision: ${persistenceLocked.statement}`);
      } else if (approvedText.includes("pg") || approvedText.includes("postgres") || approvedText.includes("pool")) {
        if (matchedToken.includes("redis") || matchedToken.includes("sqlite") || matchedToken.includes("mongoose")) {
          violations.push(`Worker introduced unapproved persistent store (${matchedToken}) conflicting with locked decision: ${persistenceLocked.statement}`);
        }
      }
    }
  }

  // Detect unauthorized retry mechanism injection in diff
  const introducesRetry = /\b(retryLimit|maxRetries|async-retry|p-retry|exponentialBackoff\()\b/i.test(diffText);
  const retryLocked = envelope.locked_decisions.some((d) => d.consequence_class === "RETRY_IDEMPOTENCY");
  if (introducesRetry && !retryLocked) {
    violations.push("Worker introduced an unvetted retry/backoff mechanism without an approved retry decision");
  }

  let conflict: DecisionConflictReceipt | undefined;
  if (violations.length > 0) {
    conflict = {
      schema: "agent-rules/decision-conflict-receipt/v1",
      version: 1,
      receipt_sha256: sha256(JSON.stringify({ taskId: envelope.task_id, violations })),
      work_id: envelope.spec_id,
      spec_id: envelope.spec_id,
      spec_revision: envelope.spec_revision,
      task_id: envelope.task_id,
      consequence_class: "BEHAVIOR",
      discovered_fact: violations.join("; "),
      suggested_patch_scope: filesChanged,
      status: "PLAN_AMENDMENT_REQUIRED",
      emitted_at: new Date().toISOString(),
    };
  }

  return {
    passed: violations.length === 0,
    violations,
    conflict,
  };
}
