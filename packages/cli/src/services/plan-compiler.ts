export interface PlanTask {
  id: string;
  description: string;
  requirementIds: string[];
  dependsOn: string[];
  ownedPaths: string[];
  acceptanceCriteria: string[];
  estimatedEffort: 'small' | 'medium' | 'large';
}

export interface PlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requirementCoverage: { id: string; covered: boolean; taskId?: string }[];
}

export interface CompiledPlan {
  schema: 'artifact/plan';
  version: 1;
  repository_baseline: { branch: string; sha: string };
  intent_reference: { hash: string; summary: string };
  tasks: PlanTask[];
  completion_policy: { require_all_tasks: boolean; require_verification: boolean };
  validation: PlanValidation;
}

function detectCycles(tasks: PlanTask[]): string[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const errors: string[] = [];

  function dfs(id: string): boolean {
    visited.add(id);
    inStack.add(id);
    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        if (!taskMap.has(dep)) continue;
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (inStack.has(dep)) {
          errors.push(`Dependency cycle detected: ${id} -> ${dep}`);
          return true;
        }
      }
    }
    inStack.delete(id);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id);
    }
  }
  return errors;
}

function findOverlappingPaths(tasks: PlanTask[]): string[] {
  const pathMap = new Map<string, string>();
  const errors: string[] = [];
  for (const task of tasks) {
    for (const p of task.ownedPaths) {
      if (pathMap.has(p)) {
        errors.push(`Overlapping owned path "${p}": claimed by ${pathMap.get(p)} and ${task.id}`);
      } else {
        pathMap.set(p, task.id);
      }
    }
  }
  return errors;
}

export function validatePlan(plan: CompiledPlan): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const cycleErrors = detectCycles(plan.tasks);
  errors.push(...cycleErrors);

  const pathErrors = findOverlappingPaths(plan.tasks);
  errors.push(...pathErrors);

  const reqToTask = new Map<string, string>();
  for (const task of plan.tasks) {
    for (const reqId of task.requirementIds) {
      if (reqToTask.has(reqId)) {
        warnings.push(`Requirement ${reqId} covered by multiple tasks: ${reqToTask.get(reqId)} and ${task.id}`);
      } else {
        reqToTask.set(reqId, task.id);
      }
    }
  }

  const requirementCoverage = [...reqToTask.entries()].map(([id, taskId]) => ({
    id,
    covered: true,
    taskId,
  }));

  if (plan.tasks.length === 0) {
    errors.push('Plan must contain at least one task');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requirementCoverage,
  };
}

function inferEffort(description: string): 'small' | 'medium' | 'large' {
  if (description.length <= 20) return 'small';
  if (description.length <= 50) return 'medium';
  return 'large';
}

export function compilePlan(
  intent: { requestHash: string; requirements: { id: string }[] },
  tasks?: Partial<PlanTask>[],
  options?: { branch?: string; sha?: string },
): CompiledPlan {
  const generatedTasks: PlanTask[] = tasks
    ? intent.requirements.map((req, idx) => {
        const partial = tasks[idx] ?? {};
        const description = partial.description ?? `Implement ${req.id}`;
        return {
          id: `T-${String(idx + 1).padStart(3, '0')}`,
          description,
          requirementIds: partial.requirementIds ?? [req.id],
          dependsOn: partial.dependsOn ?? [],
          ownedPaths: partial.ownedPaths ?? [],
          acceptanceCriteria: partial.acceptanceCriteria ?? [
            `${req.id} is implemented and verified`,
          ],
          estimatedEffort: partial.estimatedEffort ?? inferEffort(description),
        };
      })
    : intent.requirements.map((req, idx) => {
        const description = `Implement ${req.id}`;
        return {
          id: `T-${String(idx + 1).padStart(3, '0')}`,
          description,
          requirementIds: [req.id],
          dependsOn: [],
          ownedPaths: [],
          acceptanceCriteria: [
            `${req.id} is implemented and verified`,
          ],
          estimatedEffort: inferEffort(description),
        };
      });

  const coverage = intent.requirements.map(req => {
    const task = generatedTasks.find(t => t.requirementIds.includes(req.id));
    return {
      id: req.id,
      covered: !!task,
      taskId: task?.id,
    };
  });

  const plan: CompiledPlan = {
    schema: 'artifact/plan',
    version: 1,
    repository_baseline: {
      branch: options?.branch ?? 'main',
      sha: options?.sha ?? '0'.repeat(40),
    },
    intent_reference: {
      hash: intent.requestHash,
      summary: `Plan covering ${intent.requirements.length} requirements`,
    },
    tasks: generatedTasks,
    completion_policy: {
      require_all_tasks: true,
      require_verification: true,
    },
    validation: {
      valid: true,
      errors: [],
      warnings: [],
      requirementCoverage: coverage,
    },
  };

  plan.validation = validatePlan(plan);
  return plan;
}
