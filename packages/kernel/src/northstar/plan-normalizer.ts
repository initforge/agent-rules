import crypto from "node:crypto";
import type { RequirementDraft, TaskDraft } from "./compiler.js";
import type { PlannerContract, PlannerVerifier } from "./planner.js";
import type { WorkRequest } from "./protocol.js";
import type { RequirementLedger } from "./requirement-ledger.js";

export interface NativePlanArtifact {
  host: string;
  raw_text: string;
  format: "markdown" | "json" | "structured_text";
  captured_at: string;
  origin_plan_id?: string;
  source_tree_hash?: string;
  revision_hash?: string;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Normalizes a raw native host plan artifact into a canonical PlannerContract.
 * Maps tasks, requirements, verifiers, and claims while preserving the pre-frozen
 * requirement obligations.
 */
export function normalizeNativePlanArtifact(
  artifact: NativePlanArtifact,
  frozenLedger: RequirementLedger,
  request: WorkRequest
): PlannerContract {
  const text = artifact.raw_text;

  // Try JSON parse if format is JSON or wrapped in JSON code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text];
  const candidateJson = jsonMatch[1]?.trim() || text.trim();

  if (candidateJson.startsWith("{") && candidateJson.endsWith("}")) {
    try {
      const parsed = JSON.parse(candidateJson);
      if (parsed.protocol_version && parsed.requirements && parsed.tasks) {
        return {
          protocol_version: parsed.protocol_version || "2.0",
          raw_intent: parsed.raw_intent || request.raw_intent,
          risk_class: parsed.risk_class || request.risk_hint || "S1",
          requirements: parsed.requirements || [],
          tasks: parsed.tasks || [],
          verifiers: parsed.verifiers || [],
          known: parsed.known || [],
          assumed: parsed.assumed || [],
          unresolved: parsed.unresolved || [],
          requires_user: parsed.requires_user || [],
          impact: parsed.impact || {
            owning_modules: ["src"],
            dependency_breadth: "direct_only",
            public_api: [],
            schema_data: [],
            security_boundaries: [],
            reference_dependencies: [],
            relevant_tests: [],
            active_decisions: [],
          },
          decisions: parsed.decisions,
          claim_policies: parsed.claim_policies,
        };
      }
    } catch {
      // Fall through to markdown/text normalization
    }
  }

  const lines = text.split(/\r?\n/);
  const tasks: TaskDraft[] = [];
  const known: string[] = [];
  const assumed: string[] = [];
  const decisions: string[] = [];
  const unresolved: string[] = [];
  const requiresUser: string[] = [];
  const verifiers: PlannerVerifier[] = [];

  let currentSection = "";
  let taskCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#+\s+(?:Known|Facts|Existing)/i.test(trimmed)) {
      currentSection = "known";
      continue;
    }
    if (/^#+\s+(?:Assumed|Hypotheses|Unknowns)/i.test(trimmed)) {
      currentSection = "assumed";
      continue;
    }
    if (/^#+\s+(?:Decisions?|Choices|Locked Decisions)/i.test(trimmed)) {
      currentSection = "decisions";
      continue;
    }
    if (/^#+\s+(?:Unresolved|Open Questions|Ambiguities)/i.test(trimmed)) {
      currentSection = "unresolved";
      continue;
    }
    if (/^#+\s+(?:Requires User|User Review Required)/i.test(trimmed)) {
      currentSection = "requires_user";
      continue;
    }
    if (/^#+\s+(?:Tasks|Plan|Phases|Implementation Steps)/i.test(trimmed)) {
      currentSection = "tasks";
      continue;
    }
    if (/^#+\s+(?:Verification|Verifiers|Tests)/i.test(trimmed)) {
      currentSection = "verifiers";
      continue;
    }

    if (currentSection === "known" && /^[-*+]\s+/.test(trimmed)) {
      known.push(trimmed.replace(/^[-*+]\s+/, "").trim());
    } else if (currentSection === "assumed" && /^[-*+]\s+/.test(trimmed)) {
      assumed.push(trimmed.replace(/^[-*+]\s+/, "").trim());
    } else if (currentSection === "decisions" && /^[-*+]\s+/.test(trimmed)) {
      decisions.push(trimmed.replace(/^[-*+]\s+/, "").trim());
    } else if (currentSection === "unresolved" && /^[-*+]\s+/.test(trimmed)) {
      unresolved.push(trimmed.replace(/^[-*+]\s+/, "").trim());
    } else if (currentSection === "requires_user" && /^[-*+]\s+/.test(trimmed)) {
      requiresUser.push(trimmed.replace(/^[-*+]\s+/, "").trim());
    } else if (currentSection === "tasks" && (line.startsWith("###") || /^[-*+]|\d+[.)]\s+/.test(trimmed))) {
      const goal = trimmed.replace(/^(?:###\s*|[-*+]|\d+[.)]\s+)/, "").trim();
      if (goal.length > 5) {
        const taskId = `task-${taskCounter++}`;
        const claimId = `C-${taskId}`;
        const verifierId = `V-${taskId}`;
        verifiers.push({
          id: verifierId,
          kind: "test",
          argv: { executable: "npm", args: ["test"] },
          description: `Verification for ${goal}`,
        });
        tasks.push({
          goal,
          requirement_ids: [`R-${String(taskCounter).padStart(3, "0")}`],
          claim_ids: [claimId],
          owned: ["src"],
          forbidden: [],
          entrypoints: [],
          symbols: [],
          references: [],
          decisions: [],
          constraints: [],
          skills: [],
          capabilities: [],
          stop_if: [],
          verifiers_by_claim: { [claimId]: [verifierId] },
        });
      }
    } else if (currentSection === "verifiers" && /^[-*+]\s+/.test(trimmed)) {
      const vText = trimmed.replace(/^[-*+]\s+/, "").trim();
      verifiers.push({
        id: `V-custom-${verifiers.length + 1}`,
        kind: "test",
        argv: { executable: "npm", args: ["test"] },
        description: vText,
      });
    }
  }

  // If no structured tasks were extracted from headings, extract bullet points
  if (tasks.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(?:[-*+]|\d+[.)])\s+/.test(trimmed) && trimmed.length > 10) {
        const goal = trimmed.replace(/^(?:[-*+]|\d+[.)])\s+/, "").trim();
        const taskId = `task-${taskCounter++}`;
        const claimId = `C-${taskId}`;
        const verifierId = `V-${taskId}`;
        verifiers.push({
          id: verifierId,
          kind: "test",
          argv: { executable: "npm", args: ["test"] },
          description: `Verification for ${goal}`,
        });
        tasks.push({
          goal,
          requirement_ids: [`R-${String(taskCounter).padStart(3, "0")}`],
          claim_ids: [claimId],
          owned: ["src"],
          forbidden: [],
          entrypoints: [],
          symbols: [],
          references: [],
          decisions: [],
          constraints: [],
          skills: [],
          capabilities: [],
          stop_if: [],
          verifiers_by_claim: { [claimId]: [verifierId] },
        });
      }
    }
  }

  // If still empty, create default single task from raw intent
  if (tasks.length === 0) {
    const taskId = "task-001";
    const claimId = "C-task-001";
    const verifierId = "V-task-001";
    verifiers.push({
      id: verifierId,
      kind: "test",
      argv: { executable: "npm", args: ["test"] },
      description: "Execution and verifier for planned work",
    });
    tasks.push({
      goal: request.raw_intent || "Execute plan tasks",
      requirement_ids: ["R-001"],
      claim_ids: [claimId],
      owned: ["src"],
      forbidden: [],
      entrypoints: [],
      symbols: [],
      references: [],
      decisions: [],
      constraints: [],
      skills: [],
      capabilities: [],
      stop_if: [],
      verifiers_by_claim: { [claimId]: [verifierId] },
    });
  }

  // Construct RequirementDrafts from frozenLedger to strictly preserve obligations
  const requirements: RequirementDraft[] = frozenLedger.items.map((item, idx) => ({
    id: `R-${String(idx + 1).padStart(3, "0")}`,
    statement: item.text,
    mandatory: item.obligation === "MUST" || item.mandatory,
    claims: [
      {
        claim_id: `C-${String(idx + 1).padStart(3, "0")}a`,
        statement: `Fulfill requirement: ${item.text}`,
        class: "runtime",
        required_kinds: ["test"],
        verifier_id: verifiers[idx % verifiers.length]?.id,
      },
    ],
  }));

  return {
    protocol_version: "2.0",
    raw_intent: request.raw_intent,
    risk_class: request.risk_hint || "S1",
    requirements,
    tasks,
    verifiers,
    known,
    assumed,
    unresolved,
    requires_user: requiresUser,
    decisions: decisions.length > 0 ? decisions : undefined,
    impact: {
      owning_modules: ["src"],
      dependency_breadth: "direct_only",
      public_api: [],
      schema_data: [],
      security_boundaries: [],
      reference_dependencies: [],
      relevant_tests: [],
      active_decisions: decisions,
    },
  };
}
