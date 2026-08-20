import { createHash } from 'node:crypto';

export interface SupportPackAnchor {
  readonly path: string;
  readonly section: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly contentSha256: string;
  readonly requirementId: string;
}

export interface SupportPackCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface SupportPackProof {
  readonly claimId: string;
  readonly verifierId: string;
  readonly command: SupportPackCommand;
}

export interface SupportPackRequirement {
  readonly requirementId: string;
  readonly statement: string;
  readonly claimIds: readonly string[];
  readonly mandatory?: boolean;
}

export interface SupportPackClaim {
  readonly claimId: string;
  readonly statement: string;
  readonly verifierIds: readonly string[];
}

export interface SupportPackTaskInput {
  readonly taskId: string;
  readonly goal: string;
  readonly requirementIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly dependencies?: readonly string[];
  readonly ownedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly sourceAnchors: readonly SupportPackAnchor[];
  readonly decisions: readonly string[];
  readonly context: readonly string[];
  readonly microsteps: readonly string[];
  readonly invariants: readonly string[];
  readonly edgeCases: readonly string[];
  readonly proof: readonly SupportPackProof[];
  readonly rollback: readonly string[];
  readonly failurePlaybook: readonly string[];
  readonly stopIf: readonly string[];
  readonly tokenBudget: number;
  readonly decisionSurfaceBudget: number;
  readonly modelTier?: 'economy' | 'standard' | 'expert';
  readonly riskTier?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SupportPackInput {
  readonly schema: 'harness/support-pack-input';
  readonly version: 1;
  readonly planId: string;
  readonly revision: number;
  readonly rawIntent: string;
  readonly objective: string;
  readonly decisions: readonly string[];
  readonly assumptions: readonly string[];
  readonly knownUnknowns: readonly string[];
  readonly unresolved?: readonly string[];
  readonly requiresUser?: readonly string[];
  readonly requirements: readonly SupportPackRequirement[];
  readonly claims: readonly SupportPackClaim[];
  readonly tasks: readonly SupportPackTaskInput[];
}

export interface SelfContainedWorkerTaskRecipe {
  readonly schema: 'harness/worker-task-recipe';
  readonly version: 1;
  readonly planId: string;
  readonly planRevision: number;
  readonly taskId: string;
  readonly goal: string;
  readonly requirementIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly dependencies: readonly string[];
  readonly ownedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly sourceAnchors: readonly SupportPackAnchor[];
  readonly decisions: readonly string[];
  readonly context: readonly string[];
  readonly microsteps: readonly string[];
  readonly invariants: readonly string[];
  readonly edgeCases: readonly string[];
  readonly proof: readonly SupportPackProof[];
  readonly rollback: readonly string[];
  readonly failurePlaybook: readonly string[];
  readonly stopIf: readonly string[];
  readonly budgets: { readonly token: number; readonly decisionSurface: number };
  readonly modelTier: 'economy' | 'standard' | 'expert';
  readonly riskTier: 'low' | 'medium' | 'high' | 'critical';
  readonly recipeSha256: string;
}

export interface SupportPackManifest {
  readonly schema: 'harness/support-pack-manifest';
  readonly version: 1;
  readonly planId: string;
  readonly planRevision: number;
  readonly planSha256: string;
  readonly requirementIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly recipes: readonly { readonly taskId: string; readonly sha256: string }[];
  readonly manifestSha256: string;
}

export interface CompiledSupportPack {
  readonly schema: 'harness/support-pack';
  readonly version: 1;
  readonly planId: string;
  readonly planRevision: number;
  readonly rawIntentSha256: string;
  readonly manifest: SupportPackManifest;
  readonly recipes: readonly SelfContainedWorkerTaskRecipe[];
  readonly files: Readonly<Record<string, string>>;
  readonly packSha256: string;
}

export interface SelectiveSupportPackAmendment {
  readonly impactedTaskIds: readonly string[];
  readonly supersededTaskIds?: readonly string[];
}

export interface SelectiveSupportPackResult {
  readonly pack: CompiledSupportPack;
  readonly preservedTaskIds: readonly string[];
  readonly regeneratedTaskIds: readonly string[];
  readonly supersededTaskIds: readonly string[];
  readonly amendmentSha256: string;
}

export interface ImplementationIntentReceipt {
  readonly schema: 'harness/implementation-intent-receipt';
  readonly version: 1;
  readonly planId: string;
  readonly planRevision: number;
  readonly taskId: string;
  readonly requirementIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly goal: string;
  readonly ownedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly expectedChange: string;
  readonly proofPlan: readonly string[];
  readonly understood: true;
  readonly receiptSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_RECIPE_TOKENS = 12_000;
const MAX_DECISION_SURFACE = 32;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function logicalRecipeFingerprint(recipe: SelfContainedWorkerTaskRecipe): string {
  const { planRevision: _planRevision, recipeSha256: _recipeSha256, ...logicalBody } = recipe;
  return sha256(canonicalJson(logicalBody));
}

function nonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function unique(values: readonly string[], field: string): void {
  if (values.some((value) => typeof value !== 'string' || value.trim().length === 0)) throw new Error(`${field} contains an empty value`);
  if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicate values`);
}

function idSet(values: readonly string[], field: string): Set<string> {
  unique(values, field);
  return new Set(values);
}

function assertSha(value: string, field: string): void {
  if (!SHA256.test(value)) throw new Error(`${field} must be a lowercase SHA-256`);
}

function assertPath(value: string, field: string): void {
  nonEmpty(value, field);
  if (value.startsWith('/') || value.split('/').includes('..') || value.includes('\\')) {
    throw new Error(`${field} must be a repository-relative path without traversal`);
  }
}

function assertCommand(command: SupportPackCommand, field: string): void {
  nonEmpty(command.executable, `${field}.executable`);
  if (command.args.some((arg) => typeof arg !== 'string')) throw new Error(`${field}.args must contain strings`);
  if (command.cwd !== undefined) assertPath(command.cwd, `${field}.cwd`);
  if (command.timeoutMs !== undefined && (!Number.isInteger(command.timeoutMs) || command.timeoutMs <= 0)) {
    throw new Error(`${field}.timeoutMs must be a positive integer`);
  }
  if (command.args.some((arg) => /(?:&&|\|\||;|`|\$\(|\brm\s+-rf\b)/.test(arg))) {
    throw new Error(`${field}.args contains shell composition or destructive syntax`);
  }
}

function assertAcyclic(tasks: readonly SupportPackTaskInput[]): void {
  const graph = new Map(tasks.map((task) => [task.taskId, new Set(task.dependencies ?? [])]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) throw new Error(`task dependency cycle includes ${taskId}`);
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of graph.get(taskId) ?? []) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.taskId);
}

function assertInput(input: SupportPackInput): void {
  if (input.schema !== 'harness/support-pack-input' || input.version !== 1) throw new Error('unsupported support-pack input schema');
  nonEmpty(input.planId, 'planId');
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error('revision must be an integer >= 1');
  for (const [field, value] of [['rawIntent', input.rawIntent], ['objective', input.objective]] as const) nonEmpty(value, field);
  for (const [field, value] of [['decisions', input.decisions], ['assumptions', input.assumptions], ['knownUnknowns', input.knownUnknowns]] as const) unique(value, field);
  if (input.unresolved?.length || input.requiresUser?.length) throw new Error('support-pack compilation requires unresolved and user-needed items to be empty');
  if (input.requirements.length === 0 || input.claims.length === 0 || input.tasks.length === 0) throw new Error('support-pack input requires requirements, claims, and tasks');

  const requirementIds = idSet(input.requirements.map((item) => item.requirementId), 'requirements');
  const claimIds = idSet(input.claims.map((item) => item.claimId), 'claims');
  for (const requirement of input.requirements) {
    nonEmpty(requirement.statement, `${requirement.requirementId}.statement`);
    unique(requirement.claimIds, `${requirement.requirementId}.claimIds`);
    for (const claimId of requirement.claimIds) if (!claimIds.has(claimId)) throw new Error(`${requirement.requirementId} references unknown claim ${claimId}`);
  }
  for (const claim of input.claims) {
    nonEmpty(claim.statement, `${claim.claimId}.statement`);
    unique(claim.verifierIds, `${claim.claimId}.verifierIds`);
    if (claim.verifierIds.length === 0) throw new Error(`${claim.claimId}.verifierIds must not be empty`);
  }
  const taskIds = idSet(input.tasks.map((item) => item.taskId), 'tasks');
  const coveredRequirements = new Set<string>();
  const coveredClaims = new Set<string>();
  const ownedPathOwners = new Map<string, string>();
  for (const task of input.tasks) {
    nonEmpty(task.taskId, 'taskId');
    nonEmpty(task.goal, `${task.taskId}.goal`);
    unique(task.requirementIds, `${task.taskId}.requirementIds`);
    unique(task.claimIds, `${task.taskId}.claimIds`);
    if (task.requirementIds.length === 0 || task.claimIds.length === 0) throw new Error(`${task.taskId} must map requirements and claims`);
    for (const requirementId of task.requirementIds) {
      if (!requirementIds.has(requirementId)) throw new Error(`${task.taskId} references unknown requirement ${requirementId}`);
      coveredRequirements.add(requirementId);
    }
    for (const claimId of task.claimIds) {
      if (!claimIds.has(claimId)) throw new Error(`${task.taskId} references unknown claim ${claimId}`);
      coveredClaims.add(claimId);
    }
    for (const dependency of task.dependencies ?? []) if (!taskIds.has(dependency)) throw new Error(`${task.taskId} references unknown dependency ${dependency}`);
    unique(task.ownedPaths, `${task.taskId}.ownedPaths`);
    unique(task.forbiddenPaths, `${task.taskId}.forbiddenPaths`);
    if (task.ownedPaths.length === 0) throw new Error(`${task.taskId}.ownedPaths must not be empty`);
    for (const ownedPath of task.ownedPaths) {
      assertPath(ownedPath, `${task.taskId}.ownedPaths`);
      const prior = ownedPathOwners.get(ownedPath);
      if (prior) throw new Error(`owned path ${ownedPath} overlaps ${prior} and ${task.taskId}`);
      ownedPathOwners.set(ownedPath, task.taskId);
    }
    for (const forbiddenPath of task.forbiddenPaths) assertPath(forbiddenPath, `${task.taskId}.forbiddenPaths`);
    for (const anchor of task.sourceAnchors) {
      assertPath(anchor.path, `${task.taskId}.sourceAnchors.path`);
      nonEmpty(anchor.section, `${task.taskId}.sourceAnchors.section`);
      if (!Number.isInteger(anchor.lineStart) || !Number.isInteger(anchor.lineEnd) || anchor.lineStart < 1 || anchor.lineEnd < anchor.lineStart) throw new Error(`${task.taskId}.sourceAnchors line range is invalid`);
      assertSha(anchor.contentSha256, `${task.taskId}.sourceAnchors.contentSha256`);
      if (!task.requirementIds.includes(anchor.requirementId)) throw new Error(`${task.taskId} anchor is not bound to one of its requirements`);
    }
    if (task.sourceAnchors.length === 0) throw new Error(`${task.taskId}.sourceAnchors must not be empty`);
    for (const [field, value, minimum] of [
      ['decisions', task.decisions, 0], ['context', task.context, 1], ['microsteps', task.microsteps, 2],
      ['invariants', task.invariants, 1], ['edgeCases', task.edgeCases, 1], ['rollback', task.rollback, 1],
      ['failurePlaybook', task.failurePlaybook, 1], ['stopIf', task.stopIf, 1],
    ] as const) {
      unique(value, `${task.taskId}.${field}`);
      if (value.length < minimum) throw new Error(`${task.taskId}.${field} must contain at least ${minimum} item(s)`);
    }
    if (task.proof.length === 0) throw new Error(`${task.taskId}.proof must not be empty`);
    for (const proof of task.proof) {
      if (!task.claimIds.includes(proof.claimId)) throw new Error(`${task.taskId}.proof references an unassigned claim ${proof.claimId}`);
      nonEmpty(proof.verifierId, `${task.taskId}.proof.verifierId`);
      assertCommand(proof.command, `${task.taskId}.proof.command`);
    }
    for (const claimId of task.claimIds) if (!task.proof.some((proof) => proof.claimId === claimId)) throw new Error(`${task.taskId} has no exact proof command for ${claimId}`);
    if (!Number.isInteger(task.tokenBudget) || task.tokenBudget <= 0 || task.tokenBudget > MAX_RECIPE_TOKENS) throw new Error(`${task.taskId}.tokenBudget must be 1..${MAX_RECIPE_TOKENS}`);
    if (!Number.isInteger(task.decisionSurfaceBudget) || task.decisionSurfaceBudget <= 0 || task.decisionSurfaceBudget > MAX_DECISION_SURFACE) throw new Error(`${task.taskId}.decisionSurfaceBudget must be 1..${MAX_DECISION_SURFACE}`);
  }
  assertAcyclic(input.tasks);
  const missingRequirements = [...requirementIds].filter((id) => !coveredRequirements.has(id));
  const missingClaims = [...claimIds].filter((id) => !coveredClaims.has(id));
  if (missingRequirements.length || missingClaims.length) throw new Error(`support-pack coverage incomplete: requirements=${missingRequirements.join(',') || 'none'} claims=${missingClaims.join(',') || 'none'}`);
}

function recipeBody(task: SupportPackTaskInput, input: SupportPackInput): Omit<SelfContainedWorkerTaskRecipe, 'recipeSha256'> {
  return {
    schema: 'harness/worker-task-recipe', version: 1, planId: input.planId, planRevision: input.revision,
    taskId: task.taskId, goal: task.goal, requirementIds: [...task.requirementIds].sort(), claimIds: [...task.claimIds].sort(),
    dependencies: [...(task.dependencies ?? [])].sort(), ownedPaths: [...task.ownedPaths].sort(), forbiddenPaths: [...task.forbiddenPaths].sort(),
    sourceAnchors: [...task.sourceAnchors].sort((left, right) => `${left.path}:${left.lineStart}`.localeCompare(`${right.path}:${right.lineStart}`)),
    decisions: [...task.decisions], context: [...task.context], microsteps: [...task.microsteps], invariants: [...task.invariants], edgeCases: [...task.edgeCases],
    proof: [...task.proof], rollback: [...task.rollback], failurePlaybook: [...task.failurePlaybook], stopIf: [...task.stopIf],
    budgets: { token: task.tokenBudget, decisionSurface: task.decisionSurfaceBudget }, modelTier: task.modelTier ?? 'economy', riskTier: task.riskTier ?? 'medium',
  };
}

export function renderWorkerTaskRecipe(recipe: SelfContainedWorkerTaskRecipe): string {
  return [
    `# ${recipe.taskId} — ${recipe.goal}`,
    '', `Plan: ${recipe.planId} @ revision ${recipe.planRevision}`,
    `Requirements: ${recipe.requirementIds.join(', ')}`,
    `Claims: ${recipe.claimIds.join(', ')}`,
    '', '## Owned scope', '', ...recipe.ownedPaths.map((path) => `- ${path}`),
    '', '## Forbidden scope', '', ...recipe.forbiddenPaths.map((path) => `- ${path}`),
    '', '## Anchors', '', ...recipe.sourceAnchors.map((anchor) => `- ${anchor.path}:${anchor.lineStart}-${anchor.lineEnd} (${anchor.requirementId}, ${anchor.contentSha256})`),
    '', '## Ordered microsteps', '', ...recipe.microsteps.map((step, index) => `${index + 1}. ${step}`),
    '', '## Invariants', '', ...recipe.invariants.map((item) => `- ${item}`),
    '', '## Edge cases', '', ...recipe.edgeCases.map((item) => `- ${item}`),
    '', '## Exact proof', '', ...recipe.proof.map((proof) => `- ${proof.claimId} via ${proof.verifierId}: ${JSON.stringify(proof.command)}`),
    '', '## Rollback', '', ...recipe.rollback.map((item) => `- ${item}`),
    '', '## Failure playbook', '', ...recipe.failurePlaybook.map((item) => `- ${item}`),
    '', '## Stop conditions', '', ...recipe.stopIf.map((item) => `- ${item}`),
    '', `Budgets: ${recipe.budgets.token} tokens; ${recipe.budgets.decisionSurface} decisions`,
    `Recipe SHA-256: ${recipe.recipeSha256}`,
    '',
  ].join('\n');
}

export function compileSupportPack(input: SupportPackInput): CompiledSupportPack {
  assertInput(input);
  const planSha256 = sha256(canonicalJson(input));
  const recipes = input.tasks.map((task) => {
    const body = recipeBody(task, input);
    return { ...body, recipeSha256: sha256(canonicalJson(body)) };
  }).sort((left, right) => left.taskId.localeCompare(right.taskId));
  const requirementIds = input.requirements.map((item) => item.requirementId).sort();
  const claimIds = input.claims.map((item) => item.claimId).sort();
  const taskIds = recipes.map((item) => item.taskId);
  const manifestBody = {
    schema: 'harness/support-pack-manifest' as const, version: 1 as const, planId: input.planId, planRevision: input.revision,
    planSha256, requirementIds, claimIds, taskIds, recipes: recipes.map((recipe) => ({ taskId: recipe.taskId, sha256: recipe.recipeSha256 })),
  };
  const manifest: SupportPackManifest = { ...manifestBody, manifestSha256: sha256(canonicalJson(manifestBody)) };
  const files: Record<string, string> = {};
  for (const recipe of recipes) {
    files[`tasks/${recipe.taskId}.json`] = `${canonicalJson(recipe)}\n`;
    files[`tasks/${recipe.taskId}.md`] = renderWorkerTaskRecipe(recipe);
  }
  files['manifest.json'] = `${canonicalJson(manifest)}\n`;
  const body = {
    schema: 'harness/support-pack' as const, version: 1 as const, planId: input.planId, planRevision: input.revision,
    rawIntentSha256: sha256(input.rawIntent), manifest, recipes, files,
  };
  return { ...body, packSha256: sha256(canonicalJson(body)) };
}

/**
 * Recompile an amended plan while proving that only the declared impact set
 * changed logically.  Revision-bound hashes are expected to change when the
 * plan revision advances; the comparison deliberately ignores that binding
 * and checks the recipe's actual implementation content instead.
 */
export function regenerateSupportPackSelective(
  input: SupportPackInput,
  previous: CompiledSupportPack,
  amendment: SelectiveSupportPackAmendment,
): SelectiveSupportPackResult {
  if (input.planId !== previous.planId) throw new Error('support-pack amendment targets a different plan');
  if (input.revision <= previous.planRevision) throw new Error('support-pack amendment must advance the plan revision');
  unique(amendment.impactedTaskIds, 'amendment.impactedTaskIds');
  unique(amendment.supersededTaskIds ?? [], 'amendment.supersededTaskIds');
  const impacted = new Set(amendment.impactedTaskIds);
  const superseded = new Set(amendment.supersededTaskIds ?? []);
  for (const taskId of superseded) {
    if (!impacted.has(taskId)) throw new Error(`superseded task ${taskId} is not declared impacted`);
  }

  const next = compileSupportPack(input);
  const previousById = new Map(previous.recipes.map((recipe) => [recipe.taskId, recipe]));
  const nextById = new Map(next.recipes.map((recipe) => [recipe.taskId, recipe]));
  const preservedTaskIds: string[] = [];
  const regeneratedTaskIds: string[] = [];

  for (const [taskId, prior] of previousById) {
    if (superseded.has(taskId)) {
      if (nextById.has(taskId)) throw new Error(`superseded task ${taskId} still exists in amended support pack`);
      continue;
    }
    const replacement = nextById.get(taskId);
    if (!replacement) throw new Error(`unimpacted task ${taskId} disappeared from amended support pack`);
    if (impacted.has(taskId)) {
      regeneratedTaskIds.push(taskId);
      continue;
    }
    if (logicalRecipeFingerprint(prior) !== logicalRecipeFingerprint(replacement)) {
      throw new Error(`unimpacted task ${taskId} changed during selective support-pack regeneration`);
    }
    preservedTaskIds.push(taskId);
  }
  for (const taskId of nextById.keys()) {
    if (!previousById.has(taskId)) {
      if (!impacted.has(taskId)) throw new Error(`new task ${taskId} is outside the declared amendment impact set`);
      regeneratedTaskIds.push(taskId);
    }
  }

  const amendmentBody = {
    planId: input.planId,
    fromRevision: previous.planRevision,
    toRevision: input.revision,
    impactedTaskIds: [...impacted].sort(),
    supersededTaskIds: [...superseded].sort(),
    regeneratedTaskIds: [...new Set(regeneratedTaskIds)].sort(),
    preservedTaskIds: [...preservedTaskIds].sort(),
  };
  return {
    pack: next,
    preservedTaskIds: preservedTaskIds.sort(),
    regeneratedTaskIds: [...new Set(regeneratedTaskIds)].sort(),
    supersededTaskIds: [...superseded].sort(),
    amendmentSha256: sha256(canonicalJson(amendmentBody)),
  };
}

function receiptBody(receipt: Omit<ImplementationIntentReceipt, 'receiptSha256'>): Omit<ImplementationIntentReceipt, 'receiptSha256'> {
  return receipt;
}

export function createImplementationIntentReceipt(recipe: SelfContainedWorkerTaskRecipe, expectedChange: string): ImplementationIntentReceipt {
  nonEmpty(expectedChange, 'expectedChange');
  const body: Omit<ImplementationIntentReceipt, 'receiptSha256'> = {
    schema: 'harness/implementation-intent-receipt', version: 1, planId: recipe.planId, planRevision: recipe.planRevision,
    taskId: recipe.taskId, requirementIds: [...recipe.requirementIds], claimIds: [...recipe.claimIds], goal: recipe.goal,
    ownedPaths: [...recipe.ownedPaths], forbiddenPaths: [...recipe.forbiddenPaths], expectedChange,
    proofPlan: recipe.proof.map((proof) => `${proof.claimId}:${proof.verifierId}`), understood: true,
  };
  return { ...body, receiptSha256: sha256(canonicalJson(receiptBody(body))) };
}

export function assertImplementationIntentReceipt(receipt: ImplementationIntentReceipt, recipe: SelfContainedWorkerTaskRecipe): void {
  if (receipt.schema !== 'harness/implementation-intent-receipt' || receipt.version !== 1 || receipt.understood !== true) throw new Error('invalid implementation-intent receipt schema');
  if (receipt.planId !== recipe.planId || receipt.planRevision !== recipe.planRevision || receipt.taskId !== recipe.taskId) throw new Error('implementation-intent receipt is bound to the wrong plan, revision, or task');
  if (canonicalJson(receipt.requirementIds) !== canonicalJson(recipe.requirementIds) || canonicalJson(receipt.claimIds) !== canonicalJson(recipe.claimIds)) throw new Error('implementation-intent receipt claim/requirement traceability drift');
  if (canonicalJson(receipt.ownedPaths) !== canonicalJson(recipe.ownedPaths) || canonicalJson(receipt.forbiddenPaths) !== canonicalJson(recipe.forbiddenPaths)) throw new Error('implementation-intent receipt scope drift');
  nonEmpty(receipt.expectedChange, 'receipt.expectedChange');
  const body = { ...receipt } as Omit<ImplementationIntentReceipt, 'receiptSha256'> & { receiptSha256?: string };
  delete body.receiptSha256;
  if (sha256(canonicalJson(body)) !== receipt.receiptSha256) throw new Error('implementation-intent receipt hash mismatch');
  const expectedProof = recipe.proof.map((proof) => `${proof.claimId}:${proof.verifierId}`);
  if (canonicalJson(receipt.proofPlan) !== canonicalJson(expectedProof)) throw new Error('implementation-intent receipt proof plan drift');
}
