import { createHash } from "node:crypto";
import {
  compileWorkRequestEntrypoint,
  assertEntrypointParityReceipt,
  type EntrypointParityReceipt,
  type WorkAdapter,
} from "@initforge/agent-rules-engine/northstar/index";

export interface IntentRequirement {
  id: string;
  kind: "goal" | "constraint" | "non-goal" | "assumption" | "info";
  description: string;
  source: string;
  provenance: string;
}

export interface IntentContract {
  schema: "artifact/intent";
  version: 1;
  originalRequest: string;
  requestHash: string;
  requirements: IntentRequirement[];
  goals: string[];
  constraints: string[];
  nonGoals: string[];
  assumptions: string[];
  openQuestions: string[];
  createdAt: string;
}

const LABEL_MAP: Record<string, IntentRequirement["kind"]> = {
  goal: "goal",
  goals: "goal",
  constraint: "constraint",
  constraints: "constraint",
  "non-goal": "non-goal",
  "non-goals": "non-goal",
  assumption: "assumption",
  assumptions: "assumption",
};

function parseLabel(line: string): { kind: IntentRequirement["kind"]; body: string } | null {
  const trimmed = line.replace(/^[-*\s]+/, "").trim();
  const match = trimmed.match(
    /^(Goal|Goals|Constraint|Constraints|Non-goal|Non-goals|Assumption|Assumptions):\s*(.*)/i
  );
  if (!match) return null;
  const label = match[1].toLowerCase();
  const kind = LABEL_MAP[label];
  if (!kind) return null;
  return { kind, body: match[2].trim() };
}

function hashRequest(request: string): string {
  return createHash("sha256").update(request, "utf-8").digest("hex");
}

export interface WorkRequestEntrypointInput {
  adapter: WorkAdapter;
  intent: string;
  planId?: string;
  constraints?: string[];
  nonGoals?: string[];
  references?: string[];
  riskHint?: "S0" | "S1" | "S2" | "S3";
  sourceId?: string;
}

/**
 * Compile a prompt-first entrypoint (ordinary conversation, optional slash
 * command, CLI/API request, or native host action) into the canonical
 * WorkRequest. The semantic fingerprint is adapter-neutral: equivalent inputs
 * from different adapters produce identical `semanticSha256` and `workId`.
 */
export function compileWorkRequest(input: WorkRequestEntrypointInput): EntrypointParityReceipt {
  const receipt = compileWorkRequestEntrypoint({
    adapter: input.adapter,
    intent: input.intent,
    ...(input.planId ? { plan_id: input.planId } : {}),
    ...(input.constraints?.length ? { explicit_constraints: input.constraints } : {}),
    ...(input.nonGoals?.length ? { explicit_non_goals: input.nonGoals } : {}),
    ...(input.references?.length ? { reference_inputs: input.references } : {}),
    ...(input.riskHint ? { risk_hint: input.riskHint } : {}),
    ...(input.sourceId ? { source_id: input.sourceId } : {}),
  });
  assertEntrypointParityReceipt(receipt);
  return receipt;
}

/** Prove semantic equivalence of two receipts from any adapter surfaces. */
export function assertSemanticParity(left: EntrypointParityReceipt, right: EntrypointParityReceipt): void {
  if (left.semantic_sha256 !== right.semantic_sha256) throw new Error(`semantic parity mismatch: ${left.adapter} vs ${right.adapter}`);
  if (left.work_id !== right.work_id) throw new Error(`semantic parity work_id mismatch: ${left.work_id} vs ${right.work_id}`);
}

export function compileIntent(
  request: string,
  context: { facts?: string[]; files?: string[] }
): IntentContract {
  const lines = request.split("\n");
  const requirements: IntentRequirement[] = [];
  const goals: string[] = [];
  const constraints: string[] = [];
  const nonGoals: string[] = [];
  const assumptions: string[] = [];
  const openQuestions: string[] = [];
  let ridCounter = 0;

  function addRequirement(
    kind: IntentRequirement["kind"],
    description: string,
    source: string,
    provenance: string
  ): void {
    ridCounter++;
    const id = `R-${String(ridCounter).padStart(3, "0")}`;
    requirements.push({ id, kind, description, source, provenance });
  }

  let currentKind: IntentRequirement["kind"] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parsed = parseLabel(line);
    if (parsed) {
      currentKind = parsed.kind;
      if (parsed.body) {
        addRequirement(parsed.kind, parsed.body, "user", line);
        switch (parsed.kind) {
          case "goal":
            goals.push(parsed.body);
            break;
          case "constraint":
            constraints.push(parsed.body);
            break;
          case "non-goal":
            nonGoals.push(parsed.body);
            break;
          case "assumption":
            assumptions.push(parsed.body);
            break;
        }
      }
      continue;
    }

    if (/^[?]\s/.test(line) || /^Q:\s/i.test(line)) {
      const question = line.replace(/^[?]\s*|^Q:\s*/i, "").trim();
      openQuestions.push(question);
      addRequirement("info", question, "user", line);
      continue;
    }

    if (currentKind) {
      addRequirement(currentKind, line, "user", line);
      switch (currentKind) {
        case "goal":
          goals.push(line);
          break;
        case "constraint":
          constraints.push(line);
          break;
        case "non-goal":
          nonGoals.push(line);
          break;
        case "assumption":
          assumptions.push(line);
          break;
      }
      continue;
    }

    addRequirement("info", line, "user", line);
  }

  if (context.facts) {
    for (const fact of context.facts) {
      addRequirement("info", fact, "context.facts", fact);
    }
  }

  if (context.files) {
    for (const file of context.files) {
      addRequirement("info", `Referenced file: ${file}`, "context.files", file);
    }
  }

  return {
    schema: "artifact/intent",
    version: 1,
    originalRequest: request,
    requestHash: hashRequest(request),
    requirements,
    goals,
    constraints,
    nonGoals,
    assumptions,
    openQuestions,
    createdAt: new Date().toISOString(),
  };
}
