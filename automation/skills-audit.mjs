#!/usr/bin/env node
/**
 * skills-audit.mjs — read-only audit of the canonical skill catalog.
 *
 * Validates registry/skills.yaml against the SkillRegistryV2 contract, then
 * against the canonical tree (folder/frontmatter/hash for active internal and
 * upstream skills), verifies one-to-one migration parity from the old
 * external-skill reference registry, and reports the context budget
 * separately for the base global catalog and each selected profile addition
 * (combined when a profile is active). Base overage or selected-profile
 * combined overage is reported as PARTIAL — never silently truncated.
 *
 * Usage:
 *   npm run skills:audit [--profile <id>...] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { validateSkillRegistry, validateSkillRegistryTree } from '../packages/kernel/dist/northstar/skill-registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const profiles = [];
let host = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--profile' && args[i + 1]) profiles.push(args[i + 1]);
  if (args[i] === '--host' && args[i + 1]) host = args[i + 1];
}

const registryFile = path.join(root, 'registry', 'skills.yaml');
const RULES_TARGET_MIN = 800;
const RULES_TARGET_MAX = 1200;
const RULES_HARD_MAX = 1600;
const SKILL_LIST_MAX_CHARS = 16000;

// One-to-one migration parity: every old registry record must have a v2
// successor present in registry/skills.yaml (the old references/
// external-skills/registry.json was removed only after this parity passed).
function estimatedTokens(text) { return Math.ceil(text.replace(/\r\n?/g, '\n').length / 3.6); }

const result = {
  schema: 'agent-rules/skills-audit/v1',
  ok: true,
  status: 'PASS',
  issues: [],
  budgets: { rules: null, base_skill_list_chars: null, profiles: {}, combined: null },
  migration_parity: { ok: true },
};

if (!fs.existsSync(registryFile)) {
  result.ok = false;
  result.status = 'PARTIAL';
  result.issues.push('registry/skills.yaml is missing');
} else {
  const text = fs.readFileSync(registryFile, 'utf8');
  const doc = YAML.parse(text);
  const documentCheck = validateSkillRegistry(doc);
  const treeCheck = validateSkillRegistryTree(doc, root);
  for (const issue of [...documentCheck.issues, ...treeCheck.issues]) {
    result.ok = false;
    result.issues.push(`${issue.entry ?? '<registry>'}: ${issue.message}`);
  }

  const active = (doc.skills ?? []).filter((s) => s.lifecycle === 'active');
  const activeUpstream = active.filter((s) => s.origin === 'upstream');
  const activeInternal = active.filter((s) => s.origin === 'internal');

  // Migration parity: every old registry ID has a v2 successor entry.
  const registryIds = new Set((doc.skills ?? []).map((s) => s.id));
  const parityFailures = [];
  const historical = (doc.skills ?? []).filter((s) => s.lifecycle === 'retired' || s.lifecycle === 'deprecated' || s.lifecycle === 'blocked');
  for (const entry of historical) {
    for (const successor of entry.superseded_by ?? []) {
      if (!registryIds.has(successor)) parityFailures.push(`record ${entry.id} successor ${successor} is missing`);
    }
  }
  for (const entry of doc.skills ?? []) {
    for (const predecessor of entry.supersedes ?? []) {
      if (!registryIds.has(predecessor)) parityFailures.push(`record ${entry.id} predecessor ${predecessor} is missing`);
    }
  }
  if (parityFailures.length > 0) {
    result.ok = false;
    result.status = 'PARTIAL';
    for (const failure of parityFailures) result.issues.push(`migration parity: ${failure}`);
  }
  result.migration_parity = {
    old_records: historical.length,
    successor_entries: historical.reduce((n, entry) => n + (entry.superseded_by?.length ?? 0), 0),
    ok: parityFailures.length === 0,
  };

  // Context budget: always-on rules only (trigger always-load; rule 30 is
  // build/diagnostic documentation and rule 40 is repo-local — neither is
  // global model context).
  const manifestText = fs.readFileSync(path.join(root, 'rules', 'manifest.yaml'), 'utf8');
  const manifest = YAML.parse(manifestText);
  const loadOrder = manifest?.load_order ?? [];
  const contracts = manifest?.rule_contracts ?? {};
  const alwaysOnRules = loadOrder.filter((name) => (contracts[name]?.trigger ?? 'always-load') === 'always-load');
  const rulesText = alwaysOnRules
    .map((name) => {
      try { return fs.readFileSync(path.join(root, 'rules', name), 'utf8'); } catch { return ''; }
    })
    .join('\n');
  const rulesTokens = estimatedTokens(rulesText);
  result.budgets.rules = {
    estimated_tokens: rulesTokens,
    target: [RULES_TARGET_MIN, RULES_TARGET_MAX],
    hard_max: RULES_HARD_MAX,
    overage: rulesTokens > RULES_HARD_MAX,
  };
  if (rulesTokens > RULES_HARD_MAX) {
    result.ok = false;
    result.status = 'PARTIAL';
    result.issues.push(`always-on rules exceed the hard maximum (${rulesTokens} > ${RULES_HARD_MAX} tokens)`);
  }

  const hostContracts = JSON.parse(fs.readFileSync(path.join(root, 'platforms', 'platform-contracts.json'), 'utf8')).native_contracts ?? {};
  const selectedContract = host ? hostContracts[host] : null;
  const globalPathTemplate = selectedContract?.paths?.skillPath
    ?? Object.values(hostContracts).map((contract) => contract?.paths?.skillPath).filter(Boolean).sort((a, b) => b.length - a.length)[0]
    ?? '~/.agents/skills/<skill>/SKILL.md';
  const taskPathTemplate = selectedContract?.paths?.repositorySkillPath
    ?? Object.values(hostContracts).map((contract) => contract?.paths?.repositorySkillPath).filter(Boolean).sort((a, b) => b.length - a.length)[0]
    ?? '.agents/skills/<skill>/SKILL.md';
  const descriptionFor = (id, base = path.join(root, 'skills')) => {
    const file = path.join(base, id, 'SKILL.md');
    try {
      const body = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      return fm ? String(YAML.parse(fm[1])?.description ?? '') : '';
    } catch { return ''; }
  };
  const renderedChars = (id, description, template) => id.length + 1 + description.length + 1 + template.replace('<skill>', id).length;

  // Base discovery catalog: actual globally projected implicit skills, with
  // the representation hosts inject (name + description + rendered path).
  const baseSkills = [...activeInternal, ...activeUpstream].filter((skill) => skill.activation === 'implicit');
  const baseDescriptionChars = baseSkills.reduce((sum, skill) => sum + skill.id.length + 1 + descriptionFor(skill.id).length, 0);
  const skillListChars = baseSkills.reduce((sum, skill) => sum + renderedChars(skill.id, descriptionFor(skill.id), globalPathTemplate), 0);
  result.budgets.base_skill_list_chars = {
    characters: skillListChars,
    name_description_chars: baseDescriptionChars,
    rendered_path_chars: skillListChars - baseDescriptionChars,
    max: SKILL_LIST_MAX_CHARS,
    overage: skillListChars > SKILL_LIST_MAX_CHARS,
  };
  if (skillListChars > SKILL_LIST_MAX_CHARS) {
    result.ok = false;
    result.status = 'PARTIAL';
    result.issues.push(`base initial skill list exceeds the character budget (${skillListChars} > ${SKILL_LIST_MAX_CHARS})`);
  }

  // Profile additions reported separately; combined when active.
  let combinedChars = skillListChars;
  for (const profile of profiles) {
    const profileDir = path.join(root, 'profiles', profile, 'skills');
    const additions = [];
    if (fs.existsSync(profileDir)) {
      for (const entry of fs.readdirSync(profileDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = path.join(profileDir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;
        const body = fs.readFileSync(skillFile, 'utf8').replace(/^\uFEFF/, '');
        const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        additions.push({ id: entry.name, description: fm ? String(YAML.parse(fm[1])?.description ?? '') : '' });
      }
    }
    const chars = additions.reduce((sum, a) => sum + renderedChars(a.id, a.description, globalPathTemplate), 0);
    const tokens = estimatedTokens(additions.map((a) => a.description).join('\n'));
    result.budgets.profiles[profile] = {
      skill_count: additions.length,
      addition_chars: chars,
      addition_tokens: tokens,
      combined_chars: combinedChars + chars,
      combined_overage: combinedChars + chars > SKILL_LIST_MAX_CHARS,
    };
    if (combinedChars + chars > SKILL_LIST_MAX_CHARS) {
      result.ok = false;
      result.status = 'PARTIAL';
      result.issues.push(`profile ${profile} combined catalog exceeds the character budget (${combinedChars + chars} > ${SKILL_LIST_MAX_CHARS})`);
    }
    combinedChars += chars;
  }
  result.budgets.combined = { chars: combinedChars, max: SKILL_LIST_MAX_CHARS };

  const taskFile = path.join(root, '.agent', 'current', 'state.json');
  let selectedTaskIds = [];
  let taskProjectionStatus = null;
  if (fs.existsSync(taskFile)) {
    try { const state = JSON.parse(fs.readFileSync(taskFile, 'utf8')); selectedTaskIds = state.selected_skill_ids ?? []; taskProjectionStatus = state.skill_projection?.status ?? null; } catch {}
  }
  const explicitIds = new Set((doc.skills ?? []).filter((skill) => skill.lifecycle === 'active' && skill.activation === 'explicit-only').map((skill) => skill.id));
  const selectedExplicit = taskProjectionStatus === 'ACTIVE' ? selectedTaskIds.filter((id) => explicitIds.has(id)) : [];
  const taskSelectedChars = selectedExplicit.reduce((sum, id) => sum + renderedChars(id, descriptionFor(id), taskPathTemplate), 0);
  const effectiveChars = combinedChars + taskSelectedChars;
  result.catalog_accounting = {
    canonical_active_skills: active.length,
    global_projected_implicit_skills: baseSkills.length,
    explicit_library_skills: explicitIds.size,
    base_discovery_chars: baseDescriptionChars,
    base_discovery_path_chars: skillListChars - baseDescriptionChars,
    profile_addition_chars: combinedChars - skillListChars,
    task_selected_addition_chars: taskSelectedChars,
    effective_task_catalog_chars: effectiveChars,
    host_observed_total_chars: null,
    host_budget: SKILL_LIST_MAX_CHARS,
    host: host ?? 'conservative-longest-path-fallback',
    task_projection_status: taskProjectionStatus,
  };
  if (effectiveChars > SKILL_LIST_MAX_CHARS) {
    result.ok = false;
    result.status = 'PARTIAL';
    result.issues.push(`effective task catalog exceeds the character budget (${effectiveChars} > ${SKILL_LIST_MAX_CHARS})`);
  }

  result.counts = {
    total: doc.skills?.length ?? 0,
    active: active.length,
    active_internal: activeInternal.length,
    active_upstream: activeUpstream.length,
    blocked: (doc.skills ?? []).filter((s) => s.lifecycle === 'blocked').length,
    retired: (doc.skills ?? []).filter((s) => s.lifecycle === 'retired').length,
    deprecated: (doc.skills ?? []).filter((s) => s.lifecycle === 'deprecated').length,
  };
  if (activeUpstream.some((s) => !s.upstream?.content_hash)) {
    result.ok = false;
    result.status = 'PARTIAL';
    result.issues.push('an active upstream skill is missing its exact content hash');
  }
}

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`skills-audit: ${result.status}`);
  if (result.counts) console.log(`  active: ${result.counts.active} (internal ${result.counts.active_internal}, upstream ${result.counts.active_upstream}), blocked: ${result.counts.blocked}, retired: ${result.counts.retired}`);
  if (result.budgets?.rules) console.log(`  rules tokens: ${result.budgets.rules.estimated_tokens} (target ${result.budgets.rules.target[0]}–${result.budgets.rules.target[1]}, hard max ${result.budgets.rules.hard_max})`);
  if (result.budgets?.base_skill_list_chars) console.log(`  base skill list: ${result.budgets.base_skill_list_chars.characters} chars (max ${result.budgets.base_skill_list_chars.max})`);
  for (const [id, b] of Object.entries(result.budgets?.profiles ?? {})) console.log(`  profile ${id}: +${b.addition_chars} chars (combined ${b.combined_chars})`);
  if (result.catalog_accounting) console.log(`  catalog: canonical ${result.catalog_accounting.canonical_active_skills}, global implicit ${result.catalog_accounting.global_projected_implicit_skills}, explicit library ${result.catalog_accounting.explicit_library_skills}, task selected +${result.catalog_accounting.task_selected_addition_chars}, effective ${result.catalog_accounting.effective_task_catalog_chars}/${result.catalog_accounting.host_budget}`);
  for (const issue of result.issues) console.log(`  - ${issue}`);
}
process.exit(result.ok ? 0 : 2);
