import { createHash } from "node:crypto";

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
