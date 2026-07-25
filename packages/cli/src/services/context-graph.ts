import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

export interface RoutingNode {
  id: string;
  layer: string;
  source: string;
  load_policy: string;
  owner: string;
  trigger: string;
  requires: string[];
  routing: Record<string, unknown>;
  source_hash: string;
  token_estimate: number;
}

export interface ContextGraph {
  version: number;
  generated_from: string[];
  source_of_truth: Record<string, string>;
  nodes: RoutingNode[];
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function estimateTokens(text: string): number {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return Math.ceil(normalized.length / 3.6);
}

function sha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function pathSlug(p: string): string {
  return normalizePath(p).replace(/[^A-Za-z0-9]+/g, ':').replace(/^:|:$/g, '').toLowerCase();
}

function extractRouting(body: string): Record<string, unknown> | null {
  const compactMatch = body.match(/^routing:\s*(\{.*\})\s*$/m);
  if (compactMatch) {
    try { return JSON.parse(compactMatch[1]); } catch { return null; }
  }
  const parts = body.split(/^---\s*$/m, 3);
  if (parts.length < 3) return null;
  const frontmatterBlock = parts[1];
  if (!frontmatterBlock.includes('routing:')) return null;
  try {
    const parsed = yaml.load(frontmatterBlock) as Record<string, unknown>;
    const r = parsed?.routing;
    if (r && typeof r === 'object') return r as Record<string, unknown>;
  } catch { return null; }
  return null;
}

function frontmatterValue(body: string, key: string): string | null {
  const m = body.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^"(.*)"$/, '$1') : null;
}

function defaultRouting(source: string, policy: string): Record<string, unknown> {
  const routing: Record<string, unknown> = {
    signals: [], intent_signals: [], excludes: [],
    priority: 0, loads: [], requires: [], supports: [],
    project_scope: '', platform_scope: '', max_route_tokens: 0,
    default: policy === 'always',
  };
  const lower = source.toLowerCase();
  const in5fedu = lower.includes('5fedu') && (lower.includes('projects') || lower.includes('profiles'));
  if (lower.includes('00-context-map.md') && in5fedu) {
    routing.signals = ['5fedu', 'context/5fedu', 'tah-app', 'nostime'];
    routing.intent_signals = ['5fedu_setup', '5fedu_context'];
    routing.priority = 30;
    routing.loads = ['project:5fedu:router'];
    routing.project_scope = '5fedu';
  } else if (
    in5fedu && lower.includes('domains') &&
    (lower.includes('module-mapping.md') || lower.includes('ui-delivery.md'))
  ) {
    routing.signals = ['5fedu ui', 'drawer', 'listview', 'parity', 'ERP module'];
    routing.intent_signals = ['5fedu_ui'];
    routing.priority = 70;
    routing.project_scope = '5fedu';
  } else if (in5fedu && lower.includes('domains') && lower.includes('reference')) {
    routing.signals = ['detail', 'navigation', 'verify', 'surface'];
    routing.intent_signals = ['5fedu_detail'];
    routing.priority = 40;
    routing.project_scope = '5fedu';
  } else if (in5fedu && lower.includes('domains') && lower.includes('database')) {
    routing.signals = ['migration', 'rls', 'schema', 'int8', 'uuid', 'foreign key', 'index'];
    routing.intent_signals = ['5fedu_database'];
    routing.priority = 60;
    routing.project_scope = '5fedu';
  } else if (in5fedu && lower.includes('domains') && lower.includes('permission')) {
    routing.signals = ['permission', 'phân quyền', 'cap_bac', 'quyền xem', 'quyền sửa', 'quyền xóa', 'quản trị'];
    routing.intent_signals = ['5fedu_permissions'];
    routing.priority = 60;
    routing.project_scope = '5fedu';
  } else if (in5fedu && lower.includes('domains') && lower.includes('business')) {
    routing.signals = ['master-detail', 'duyệt', 'rollup', 'export', 'báo cáo', 'thống kê', 'excel', 'pdf'];
    routing.intent_signals = ['5fedu_business'];
    routing.priority = 50;
    routing.project_scope = '5fedu';
  }
  return routing;
}

function addNode(
  nodes: RoutingNode[], id: string, layer: string, source: string,
  policy: string, owner: string, trigger: string, _requires: string[] = [],
  routing: Record<string, unknown> | null = null,
  root: string,
): void {
  const sourcePath = path.join(root, ...source.split('/'));
  if (!routing) routing = defaultRouting(source, policy);
  let sourceHash = '0'.repeat(64);
  let tokenEst = 0;
  try {
    if (fs.existsSync(sourcePath)) {
      sourceHash = sha256(sourcePath);
      const text = fs.readFileSync(sourcePath, 'utf-8');
      tokenEst = estimateTokens(text);
    }
  } catch { }
  if (nodes.some(n => n.id === id)) {
    throw new Error(`Duplicate node ID: ${id}`);
  }
  nodes.push({
    id, layer, source: normalizePath(source),
    load_policy: policy, owner,
    trigger: trigger || `path:${source}`,
    requires: _requires,
    routing,
    source_hash: sourceHash,
    token_estimate: tokenEst,
  });
}

export function buildContextGraph(root: string): ContextGraph {
  const nodes: RoutingNode[] = [];

  const manifestPath = path.join(root, 'rules', 'manifest.yaml');
  const manifestBody = fs.readFileSync(manifestPath, 'utf-8');
  const loadOrder: string[] = [];
  const loadRegex = /^\s+-\s+(\S+\.md)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = loadRegex.exec(manifestBody)) !== null) loadOrder.push(m[1]);

  const rulesDir = path.join(root, 'rules');
  for (const entry of fs.readdirSync(rulesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
    const rel = `rules/${entry.name}`;
    const body = fs.readFileSync(path.join(rulesDir, entry.name), 'utf-8');
    const policy: string = loadOrder.includes(entry.name) ? 'always' : 'router';
    const routing = extractRouting(body);
    addNode(nodes, `rule:${path.basename(entry.name, '.md')}`, 'rules', rel,
      policy, rel, frontmatterValue(body, 'description') || '', [], routing, root);
  }

  const skillsRoot = path.join(root, 'skills');
  for (const dir of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const body = fs.readFileSync(skillPath, 'utf-8');
    const skillId = dir.name;
    const skillRouting = extractRouting(body);
    if (!skillRouting) throw new Error(`Missing structured routing metadata: skills/${skillId}/SKILL.md`);
    addNode(nodes, `skill:${skillId}`, 'skills', `skills/${skillId}/SKILL.md`,
      'skill', `skills/${skillId}/SKILL.md`, frontmatterValue(body, 'description') || '',
      [], skillRouting, root);
    const refRoot = path.join(skillsRoot, dir.name, 'references');
    if (fs.existsSync(refRoot)) {
      for (const ref of walkFiles(refRoot)) {
        const refRel = normalizePath(path.relative(root, ref));
        addNode(nodes, `reference:${skillId}:${pathSlug(refRel)}`, 'skills-reference',
          refRel, 'reference', `skills/${skillId}/SKILL.md`, `requires:${skillId}`, [], null, root);
      }
    }
  }

  const profileRoot = path.join(root, 'profiles');
  if (fs.existsSync(profileRoot)) {
    for (const profileDir of fs.readdirSync(profileRoot, { withFileTypes: true })) {
      if (!profileDir.isDirectory()) continue;
      const profileSkillsDir = path.join(profileRoot, profileDir.name, 'skills');
      if (!fs.existsSync(profileSkillsDir)) continue;
      for (const skillDir of fs.readdirSync(profileSkillsDir, { withFileTypes: true })) {
        if (!skillDir.isDirectory()) continue;
        const skillPath = path.join(profileSkillsDir, skillDir.name, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;
        const body = fs.readFileSync(skillPath, 'utf-8');
        const skillId = skillDir.name;
        const skillRouting = extractRouting(body);
        if (!skillRouting) throw new Error(`Missing structured routing metadata: profiles/${profileDir.name}/skills/${skillId}/SKILL.md`);
        addNode(nodes, `skill:${skillId}`, 'skills',
          `profiles/${profileDir.name}/skills/${skillId}/SKILL.md`,
          'skill', `profiles/${profileDir.name}/skills/${skillId}/SKILL.md`,
          frontmatterValue(body, 'description') || '', [], skillRouting, root);
        const refRoot2 = path.join(profileSkillsDir, skillDir.name, 'references');
        if (fs.existsSync(refRoot2)) {
          for (const ref of walkFiles(refRoot2)) {
            const refRel = normalizePath(path.relative(root, ref));
            addNode(nodes, `reference:${skillId}:${pathSlug(refRel)}`, 'skills-reference',
              refRel, 'reference', `profiles/${profileDir.name}/skills/${skillId}/SKILL.md`,
              `requires:${skillId}`, [], null, root);
          }
        }
      }
    }
  }

  const profileProjectsRoot = path.join(root, 'profiles');
  if (fs.existsSync(profileProjectsRoot)) {
    for (const profileDir of fs.readdirSync(profileProjectsRoot, { withFileTypes: true })) {
      if (!profileDir.isDirectory()) continue;
      const projDir = path.join(profileProjectsRoot, profileDir.name, 'projects');
      if (!fs.existsSync(projDir)) continue;
      const profileName = profileDir.name;
      for (const projFile of walkFiles(projDir)) {
        const rel = normalizePath(path.relative(root, projFile));
        if (projFile.endsWith('AGENTS.md')) {
          const dir = path.dirname(rel);
          const base = path.basename(rel, '.md');
          const isRoot = dir === `profiles/${profileName}/projects`;
          const entryId = isRoot
            ? `project:${profileName}:entry`
            : `project:${profileName}:${pathSlug(`${dir.replace(`profiles/${profileName}/projects/`, '')}/${base}`)}`;
          addNode(nodes, entryId, 'project', rel,
            'router', rel, `project:${profileName}`, [], null, root);
          continue;
        }
        if (projFile.endsWith('00-context-map.md')) {
          addNode(nodes, `project:${profileName}:router`, 'project', rel,
            'router', rel, `project:${profileName}:domain`, [], null, root);
          continue;
        }
        let policy = 'verify-only';
        if (rel.includes('/references/')) policy = 'reference';
        else if (rel.includes('/domains/')) policy = 'leaf';
        else if (rel.includes('/archive/') || rel.includes('/evidence/')) policy = 'verify-only';
        else continue;
        const pslug = pathSlug(rel);
        addNode(nodes, `project:${profileName}:${pslug}`, 'project', rel,
          policy, rel, `domain:${profileName}`, [], null, root);
      }
    }
  }

  const platformsDir = path.join(root, 'platforms');
  for (const platformDir of fs.readdirSync(platformsDir, { withFileTypes: true })) {
    if (!platformDir.isDirectory()) continue;
    const overlay = path.join(platformsDir, platformDir.name, `${platformDir.name}-overlay.md`);
    if (fs.existsSync(overlay)) {
      addNode(nodes, `platform:${platformDir.name}`, 'platform',
        `platforms/${platformDir.name}/${platformDir.name}-overlay.md`,
        'platform', `platforms/${platformDir.name}`, `platform:${platformDir.name}`, [], null, root);
    }
  }

  const guidesDir = path.join(root, 'docs', 'guides');
  if (fs.existsSync(guidesDir)) {
    for (const guide of walkFiles(guidesDir)) {
      const rel = normalizePath(path.relative(root, guide));
      addNode(nodes, `guide:${pathSlug(rel)}`, 'guide', rel,
        'verify-only', 'guides', `guide:${path.basename(guide, '.md')}`, [], null, root);
    }
  }

  const integRoot = path.join(root, 'integrations');
  if (fs.existsSync(integRoot)) {
    for (const integ of walkFiles(integRoot)) {
      const rel = normalizePath(path.relative(root, integ));
      const policy = path.basename(integ) === 'registry.json' ? 'router' : 'verify-only';
      addNode(nodes, `integration:${pathSlug(rel)}`, 'integration', rel,
        policy, 'integrations/registry.json', `integration:${path.basename(integ)}`, [], null, root);
    }
  }

  nodes.sort((a, b) => {
    if (a.layer !== b.layer) return a.layer.localeCompare(b.layer);
    return a.id.localeCompare(b.id);
  });

  return {
    version: 2,
    generated_from: [
      'rules/manifest.yaml', 'skills/**/SKILL.md',
      'profiles/**/projects/**/AGENTS.md', 'profiles/**/projects/**/00-context-map.md',
      'platforms/*/*-overlay.md', 'integrations/registry.json', 'docs/guides/**',
    ],
    source_of_truth: {
      rules: 'rules/manifest.yaml',
      skills: 'SKILL.md frontmatter routing object',
      projects: 'project entrypoint and 00-context-map.md',
      platforms: 'platform overlay and platform-contracts.json',
    },
    nodes,
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  stats: {
    totalNodes: number;
    nodesByLayer: Record<string, number>;
    totalTokens: number;
    sourceCount: number;
    missingSources: number;
  };
}

export function validateGraph(graph: ContextGraph): ValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const nodesByLayer: Record<string, number> = {};
  let totalTokens = 0;
  const sources = new Set<string>();
  let missingSources = 0;

  for (const node of graph.nodes) {
    if (!node.id) errors.push('Node missing id');
    if (!node.layer) errors.push(`Node ${node.id || '?'} missing layer`);
    if (!node.source) errors.push(`Node ${node.id || '?'} missing source`);
    if (!node.load_policy) errors.push(`Node ${node.id || '?'} missing load_policy`);
    if (!node.trigger) errors.push(`Node ${node.id || '?'} missing trigger`);
    if (!node.owner) errors.push(`Node ${node.id || '?'} missing owner`);
    if (!Array.isArray(node.requires)) errors.push(`Node ${node.id || '?'} missing requires array`);
    if (!node.routing || typeof node.routing !== 'object') errors.push(`Node ${node.id || '?'} missing routing`);
    if (typeof node.token_estimate !== 'number' || node.token_estimate < 0) errors.push(`Node ${node.id || '?'} invalid token_estimate`);
    if (seenIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    seenIds.add(node.id);
    if (node.source_hash === '0'.repeat(64)) {
      missingSources++;
    }
    nodesByLayer[node.layer] = (nodesByLayer[node.layer] || 0) + 1;
    totalTokens += node.token_estimate;
    sources.add(node.source);
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      totalNodes: graph.nodes.length,
      nodesByLayer,
      totalTokens,
      sourceCount: sources.size,
      missingSources,
    },
  };
}

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(fullPath));
    else if (entry.isFile()) results.push(fullPath);
  }
  return results;
}
