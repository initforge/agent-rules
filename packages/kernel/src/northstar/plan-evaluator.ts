import type { PlannerContract } from './planner.js';
import type { WorkRequest } from './protocol.js';
import {
  reconcileRequirementLedger,
  type RequirementDomain,
  type RequirementLedger,
  type RequirementLedgerItem,
} from './requirement-ledger.js';

export interface PlanEvaluationFinding {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  items?: string[];
}

export interface PlanEvaluationResult {
  verdict: 'PASS' | 'REJECT' | 'NEEDS_REPLAN';
  missing_mandatory: RequirementLedgerItem[];
  missing_highest_priority: RequirementLedgerItem[];
  epistemic_violations: Array<{ item_id: string; reason: string }>;
  skill_discovery_failures: Array<{ skill_id: string; reason: string }>;
  reference_omissions: string[];
  domain_coverage: Record<RequirementDomain, { total: number; covered: number }>;
  findings: PlanEvaluationFinding[];
  evaluated_at: string;
}

export interface PlanEvaluationInput {
  request: WorkRequest;
  ledger: RequirementLedger;
  contract: PlannerContract;
  repoFacts?: unknown;
  availableSkills?: string[];
  requiredSkills?: string[];
}

const DOMAIN_TO_SKILLS: Record<RequirementDomain, string[]> = {
  ui_ux: ['frontend-architect', 'frontend-design-contract', 'ui-taste', 'browser-qa'],
  frontend: ['frontend-architect', 'vercel-react-best-practices'],
  backend: ['backend-composition', 'quality'],
  security: ['security-review', 'trail-of-bits-security'],
  data: ['schema-migration', 'database-stack'],
  infra: ['infra-devops-composition'],
  domain_a: ['synthetic-domain-a-skill'],
  domain_b: ['synthetic-domain-b-skill'],
  general: [],
};

/**
 * Independently compare:
 * raw intent ↔ requirement ledger ↔ repo facts ↔ candidate plan.
 *
 * A candidate plan MUST NOT become Frozen when:
 * - a MUST-obligation requirement is absent;
 * - a highest-priority problem disappears;
 * - an unsupported assumption is silently converted to fact;
 * - required domain knowledge was unavailable because a projected skill failed discovery;
 * - reference inputs (images/files) were dropped;
 * - the plan covers the wrong subset of the user's request.
 */
export function evaluateCandidatePlan(input: PlanEvaluationInput): PlanEvaluationResult {
  const reconciled = reconcileRequirementLedger(input.ledger, input.contract);
  const findings: PlanEvaluationFinding[] = [];

  const missingMandatory: RequirementLedgerItem[] = [];
  const missingHighestPriority: RequirementLedgerItem[] = [];

  const domainTotals: Record<RequirementDomain, { total: number; covered: number }> = {
    ui_ux: { total: 0, covered: 0 },
    backend: { total: 0, covered: 0 },
    frontend: { total: 0, covered: 0 },
    security: { total: 0, covered: 0 },
    data: { total: 0, covered: 0 },
    infra: { total: 0, covered: 0 },
    domain_a: { total: 0, covered: 0 },
    domain_b: { total: 0, covered: 0 },
    general: { total: 0, covered: 0 },
  };

  for (const item of reconciled.items) {
    if (domainTotals[item.affected_domain]) {
      domainTotals[item.affected_domain].total++;
    }
    if (item.covered_in_plan) {
      if (domainTotals[item.affected_domain]) {
        domainTotals[item.affected_domain].covered++;
      }
    } else {
      if (item.obligation === 'MUST' || item.mandatory) {
        missingMandatory.push(item);
      }
      if (item.priority === 'HIGHEST') {
        missingHighestPriority.push(item);
      }
    }
  }

  // 1. MUST-obligation requirement coverage check (Strict 100% invariant)
  if (missingMandatory.length > 0) {
    findings.push({
      code: 'MANDATORY_REQUIREMENT_MISSING',
      severity: 'error',
      message: `${missingMandatory.length} MUST-obligation requirement(s) missing from candidate plan`,
      items: missingMandatory.map((m) => `[${m.id}] (${m.priority}/${m.affected_domain}) ${m.text}`),
    });
  }

  // 2. Highest-priority defect dropped check
  if (missingHighestPriority.length > 0) {
    findings.push({
      code: 'HIGHEST_PRIORITY_DROPPED',
      severity: 'error',
      message: `${missingHighestPriority.length} highest-priority requirement(s) omitted from candidate plan`,
      items: missingHighestPriority.map((m) => `[${m.id}] (${m.affected_domain}) ${m.text}`),
    });
  }

  // 3. Epistemic integrity check: UNKNOWN / HYPOTHESIS must not become authorized facts in 'known' without verification
  const epistemicViolations: Array<{ item_id: string; reason: string }> = [];
  const knownText = (input.contract.known ?? []).join(' ').toLowerCase();

  for (const item of reconciled.items) {
    if (item.epistemic_status === 'HYPOTHESIS' || item.epistemic_status === 'UNKNOWN') {
      const itemLower = item.text.toLowerCase();
      const hypothesisMatch = itemLower.match(/(?:có\s+thể\s+do|might\s+be|could\s+be|suspect(?:ed)?|giả\s+định)\s+(.+)$/i);
      const targetPhrase = hypothesisMatch ? hypothesisMatch[1].trim() : itemLower;

      const words = targetPhrase.match(/[\p{L}\p{N}]{3,}/gu) ?? [];
      const matched = words.filter((w) => knownText.includes(w)).length;
      const ratio = words.length > 0 ? matched / words.length : 0;

      if (knownText.includes(targetPhrase) || (words.length >= 2 && ratio >= 0.5)) {
        epistemicViolations.push({
          item_id: item.id,
          reason: `item marked ${item.epistemic_status} was converted into an unproven fact in 'known': "${targetPhrase}"`,
        });
      }
    }
  }

  if (epistemicViolations.length > 0) {
    findings.push({
      code: 'EPISTEMIC_CONVERSION_VIOLATION',
      severity: 'error',
      message: `${epistemicViolations.length} hypothesis/unknown item(s) converted to unproven facts`,
      items: epistemicViolations.map((v) => `${v.item_id}: ${v.reason}`),
    });
  }

  // 4. Skill discovery check: if a domain has active requirements, verify that at least one relevant skill family is available
  const skillDiscoveryFailures: Array<{ skill_id: string; reason: string }> = [];
  const available = new Set(input.availableSkills ?? []);

  if (input.availableSkills !== undefined) {
    for (const [domain, stats] of Object.entries(domainTotals) as Array<[RequirementDomain, { total: number; covered: number }]>) {
      if (stats.total > 0) {
        const expectedSkills = DOMAIN_TO_SKILLS[domain] ?? [];
        const found = expectedSkills.some((skill) => available.has(skill));
        if (!found && expectedSkills.length > 0) {
          skillDiscoveryFailures.push({
            skill_id: expectedSkills[0],
            reason: `domain ${domain} had active requirements but expected skills [${expectedSkills.join(', ')}] were not discoverable in host plan session`,
          });
        }
      }
    }
  }

  if (skillDiscoveryFailures.length > 0) {
    findings.push({
      code: 'REQUIRED_SKILL_NOT_DISCOVERABLE',
      severity: 'error',
      message: `${skillDiscoveryFailures.length} domain skill(s) failed host discovery during planning`,
      items: skillDiscoveryFailures.map((s) => `${s.skill_id}: ${s.reason}`),
    });
  }

  // 5. Reference Input Preservation Check
  const referenceOmissions: string[] = [];
  const allPlanText = [
    ...input.contract.requirements.map((r) => r.statement),
    ...input.contract.tasks.map((t) => t.goal),
    ...(input.contract.known ?? []),
    ...(input.contract.assumed ?? []),
  ].join(' ').toLowerCase();

  for (const ref of input.request.reference_inputs ?? []) {
    const baseRef = ref.split(/[\\/]/).pop()?.toLowerCase();
    if (baseRef && !allPlanText.includes(baseRef)) {
      referenceOmissions.push(ref);
    }
  }

  // 6. Asymmetric domain bias check: if a specialized domain has 0% coverage while UI has >0% coverage
  const specializedDomains: RequirementDomain[] = ['domain_a', 'domain_b', 'backend', 'security', 'data'];
  for (const domain of specializedDomains) {
    if (domainTotals[domain] && domainTotals[domain].total > 0 && domainTotals[domain].covered === 0 && domainTotals.ui_ux.covered > 0) {
      findings.push({
        code: 'DOMAIN_COVERAGE_ASYMMETRY',
        severity: 'error',
        message: `plan covers UI/UX (${domainTotals.ui_ux.covered}/${domainTotals.ui_ux.total}) while completely dropping ${domain.toUpperCase()} (0/${domainTotals[domain].total})`,
      });
    }
  }

  const hasErrors = findings.some((f) => f.severity === 'error');
  const verdict: 'PASS' | 'REJECT' | 'NEEDS_REPLAN' = hasErrors ? 'NEEDS_REPLAN' : 'PASS';

  return {
    verdict,
    missing_mandatory: missingMandatory,
    missing_highest_priority: missingHighestPriority,
    epistemic_violations: epistemicViolations,
    skill_discovery_failures: skillDiscoveryFailures,
    reference_omissions: referenceOmissions,
    domain_coverage: domainTotals,
    findings,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * Build an explicit replan prompt giving targeted feedback to the native planner
 * when candidate plan evaluation detects omitted mandatory or high-priority items.
 */
export function buildReplanPrompt(input: {
  request: WorkRequest;
  ledger: RequirementLedger;
  evaluation: PlanEvaluationResult;
  attempt: number;
}): string {
  const missingSummary = [
    ...input.evaluation.missing_highest_priority.map((m) => `- [HIGHEST PRIORITY / ${m.affected_domain.toUpperCase()}] ${m.text}`),
    ...input.evaluation.missing_mandatory.filter((m) => m.priority !== 'HIGHEST').map((m) => `- [MANDATORY / ${m.affected_domain.toUpperCase()}] ${m.text}`),
  ];

  return [
    `# Agent Rules Replan Request (Attempt ${input.attempt})`,
    'Your previous candidate plan was REJECTED by independent requirement evaluation.',
    'Reason(s):',
    ...input.evaluation.findings.map((f) => `  * [${f.code}] ${f.message}`),
    '',
    'The following mandatory/highest-priority requirements from the raw user intent were MISSING or insufficiently covered in the candidate plan:',
    ...missingSummary,
    '',
    `Raw user intent: ${JSON.stringify(input.request.raw_intent)}`,
    '',
    'Instructions for replanning:',
    '1. You MUST include explicit requirement(s), claim(s), and task(s) for the missing highest-priority items.',
    '2. Do NOT drop core defects to focus only on superficial UI/UX changes.',
    '3. Every mandatory claim must map to fresh, executable verification.',
    '4. Return JSON ONLY matching the required PlannerContract schema.',
  ].join('\n');
}
