import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TaskPacket, WorkSpec } from './protocol.js';
import type { TraceabilityManifest } from './compiler.js';
import type { SkillRoute } from './routing.js';

export interface CompiledContextItem {
  kind: 'invariant' | 'requirement' | 'claim' | 'decision' | 'reference' | 'entrypoint' | 'symbol' | 'skill' | 'failure';
  source: string;
  content: string;
  priority: number;
}

export interface ContextRetrievalTelemetry {
  semantic_queries: number;
  semantic_hits: number;
  lexical_queries: number;
}

export interface CompiledContext {
  task_id: string;
  items: CompiledContextItem[];
  estimated_tokens: number;
  omitted: Array<{ source: string; reason: string }>;
  retrieval: ContextRetrievalTelemetry;
  /** Bounded localization proof for large repositories; no whole-repo dump is implied. */
  localization?: {
    requested_roots: string[];
    localized_entrypoints: string[];
    localized_symbols: string[];
    unresolved_symbols: string[];
    retrieval_mode: 'lexical' | 'hybrid';
    bounded: true;
  };
}

export interface SemanticSymbolHit {
  path: string;
  line?: number;
  symbol?: string;
  snippet?: string;
  score?: number;
}

export interface SemanticCodeResolver {
  id: string;
  resolveSymbol(input: { repoRoot: string; symbol: string; roots: string[]; maxHits: number }): SemanticSymbolHit[];
}


export interface ContextCompileOptions {
  /** Active target workspace: task files, entrypoints, references and symbols resolve here. */
  repoRoot: string;
  /** Agent-rules installation: routed SKILL.md files resolve here so projects do not vendor harness context. */
  skillRoot?: string;
  tokenBudget?: number;
  skills?: SkillRoute[];
  previousFailure?: string | null;
  /** Optional provider-neutral semantic retrieval seam (LSP, codebase-memory, Serena, etc.). */
  semanticResolver?: SemanticCodeResolver;
}


const estimateTokens = (text: string): number => Math.ceil(text.length / 3.6);

function normaliseRel(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isForbidden(candidate: string, forbidden: readonly string[]): boolean {
  const rel = normaliseRel(candidate);
  return forbidden.some((blocked) => {
    const b = normaliseRel(blocked).replace(/\/\*\*$/, '');
    return rel === b || rel.startsWith(`${b}/`);
  });
}

function containedPath(repoRoot: string, rel: string): string | null {
  const target = path.resolve(repoRoot, rel);
  const root = path.resolve(repoRoot);
  if (target === root || target.startsWith(`${root}${path.sep}`)) return target;
  return null;
}

function readReference(repoRoot: string, rel: string, maxChars = 24_000): string | null {
  const target = containedPath(repoRoot, rel);
  if (!target) return null;
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile()) return null;
    const text = fs.readFileSync(target, 'utf8');
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n…[truncated by Context Compiler]` : text;
  } catch {
    return null;
  }
}

function searchRoots(packet: TaskPacket, repoRoot: string): string[] {
  const roots = new Set<string>();
  for (const rel of [...packet.scope.owned, ...(packet.context?.entrypoints ?? [])]) {
    if (!rel || isForbidden(rel, packet.scope.forbidden)) continue;
    const clean = normaliseRel(rel).replace(/[*?{}[\]]+.*$/, '').replace(/\/$/, '');
    const target = containedPath(repoRoot, clean || '.');
    if (!target || !fs.existsSync(target)) continue;
    try {
      roots.add(fs.statSync(target).isDirectory() ? (clean || '.') : (path.dirname(clean) || '.'));
    } catch { /* omit unreadable roots */ }
  }
  // Repo-wide ownership is valid for some maintenance tasks, but keep obvious
  // generated/dependency trees out via rg globs and result bounds below.
  if (roots.size === 0 && packet.scope.owned.length === 0) roots.add('.');
  return [...roots].sort();
}

function parseRgLine(line: string): { rel: string; rendered: string } | null {
  const first = line.indexOf(':');
  if (first <= 0) return null;
  const rel = normaliseRel(line.slice(0, first));
  return { rel, rendered: line };
}

/** Resolve a symbol to bounded, source-grounded locations instead of echoing its name. */
function resolveSymbolLexically(repoRoot: string, packet: TaskPacket, symbol: string): string | null {
  const roots = searchRoots(packet, repoRoot);
  if (roots.length === 0) return null;
  const args = [
    '-n', '--fixed-strings', '--no-heading', '--color', 'never',
    '--glob', '!node_modules/**', '--glob', '!.git/**', '--glob', '!dist/**', '--glob', '!coverage/**',
    '--', symbol, ...roots,
  ];
  const result = spawnSync('rg', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 512 * 1024 });
  if (!result.error && (result.status === 0 || result.status === 1)) {
    const safe = String(result.stdout ?? '').split(/\r?\n/).filter(Boolean)
      .map(parseRgLine)
      .filter((entry): entry is { rel: string; rendered: string } => !!entry)
      .filter((entry) => !isForbidden(entry.rel, packet.scope.forbidden))
      .slice(0, 12)
      .map((entry) => entry.rendered.replace(/\\/g, '/'));
    return safe.length ? safe.join('\n') : null;
  }

  // rg is an optional host capability. Deterministic bounded fallback keeps the
  // compiler useful on minimal hosts without broad recursive catalog loading.
  const matches: string[] = [];
  const visited = new Set<string>();
  const walk = (relative: string): void => {
    if (matches.length >= 12) return;
    const abs = containedPath(repoRoot, relative);
    if (!abs || visited.has(abs) || isForbidden(relative, packet.scope.forbidden)) return;
    visited.add(abs);
    let stat: fs.Stats;
    try { stat = fs.statSync(abs); } catch { return; }
    if (stat.isDirectory()) {
      if (['.git', 'node_modules', 'dist', 'coverage'].includes(path.basename(abs))) return;
      let entries: string[];
      try { entries = fs.readdirSync(abs).sort(); } catch { return; }
      for (const entry of entries.slice(0, 250)) walk(normaliseRel(path.join(relative, entry)));
      return;
    }
    if (!stat.isFile() || stat.size > 1_000_000) return;
    let text: string;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { return; }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && matches.length < 12; i += 1) {
      if (lines[i].includes(symbol)) matches.push(`${normaliseRel(relative)}:${i + 1}:${lines[i].slice(0, 500)}`);
    }
  };
  roots.forEach(walk);
  return matches.length ? matches.join('\n') : null;
}

function resolveSymbolSemantically(repoRoot: string, packet: TaskPacket, symbol: string, resolver: SemanticCodeResolver): string | null {
  const roots = searchRoots(packet, repoRoot);
  if (roots.length === 0) return null;
  const hits = resolver.resolveSymbol({ repoRoot, symbol, roots, maxHits: 12 }) ?? [];
  const safe = hits
    .filter((hit) => typeof hit.path === 'string' && hit.path.length > 0)
    .map((hit) => ({ ...hit, path: normaliseRel(hit.path) }))
    .filter((hit) => !isForbidden(hit.path, packet.scope.forbidden))
    .filter((hit) => containedPath(repoRoot, hit.path) !== null)
    .slice(0, 12);
  if (!safe.length) return null;
  return safe.map((hit) => {
    const location = hit.line && hit.line > 0 ? `${hit.path}:${hit.line}` : hit.path;
    const details = [hit.symbol, hit.snippet].filter(Boolean).join(' — ');
    return `${location}${details ? `: ${details}` : ''}`;
  }).join('\n');
}

/** Build a bounded context bundle; full catalogs and unrelated history stay invisible. */
export function compileContext(packet: TaskPacket, spec: WorkSpec, manifest: TraceabilityManifest, options: ContextCompileOptions): CompiledContext {
  const budget = options.tokenBudget ?? 8_000;
  const items: CompiledContextItem[] = [];
  const omitted: Array<{ source: string; reason: string }> = [];
  const retrieval: ContextRetrievalTelemetry = { semantic_queries: 0, semantic_hits: 0, lexical_queries: 0 };
  const add = (item: CompiledContextItem): void => { items.push(item); };

  add({ kind: 'invariant', source: 'north-star', priority: 1000, content: 'Satisfy only this TaskPacket. Stay inside owned scope. Never weaken verification. Stop on stop_if. Return changes/blockers; PASS is derived by the harness.' });
  for (const reqId of packet.requirements) {
    const req = spec.requirements.find((candidate) => candidate.id === reqId);
    if (req) add({ kind: 'requirement', source: req.id, priority: 950, content: req.statement });
  }
  for (const acceptance of packet.acceptance) {
    const claim = manifest.claims.find((candidate) => candidate.claim_id === acceptance.claim_id);
    if (claim) add({ kind: 'claim', source: claim.claim_id, priority: 930, content: `${claim.statement}\nclass=${claim.class}\nverifier=${acceptance.verifier_id ?? claim.verifier_id ?? 'UNRESOLVED'}` });
  }
  for (const decision of packet.context?.decisions ?? spec.decisions ?? []) add({ kind: 'decision', source: 'decision', priority: 850, content: decision });
  if (options.previousFailure) add({ kind: 'failure', source: 'previous-failure', priority: 900, content: options.previousFailure });

  for (const [kind, refs, priority] of [
    ['entrypoint', packet.context?.entrypoints ?? [], 800],
    ['reference', packet.context?.references ?? [], 780],
  ] as const) {
    for (const rel of refs) {
      if (isForbidden(rel, packet.scope.forbidden)) {
        omitted.push({ source: rel, reason: 'forbidden by TaskPacket scope' });
        continue;
      }
      const content = readReference(options.repoRoot, rel);
      if (content === null) {
        omitted.push({ source: rel, reason: 'file missing, outside repo, or not readable' });
        continue;
      }
      add({ kind, source: rel, priority, content });
    }
  }
  for (const symbol of packet.context?.symbols ?? []) {
    let resolved: string | null = null;
    let source = symbol;
    if (options.semanticResolver) {
      retrieval.semantic_queries += 1;
      resolved = resolveSymbolSemantically(options.repoRoot, packet, symbol, options.semanticResolver);
      if (resolved) { retrieval.semantic_hits += 1; source = `${symbol} via ${options.semanticResolver.id}`; }
    }
    if (!resolved) {
      retrieval.lexical_queries += 1;
      resolved = resolveSymbolLexically(options.repoRoot, packet, symbol);
    }
    if (resolved) add({ kind: 'symbol', source, priority: 760, content: resolved });
    else omitted.push({ source: symbol, reason: 'symbol not found by semantic provider or bounded lexical fallback' });
  }
  for (const route of options.skills ?? []) {
    const rel = route.source ?? `skills/${route.id}/SKILL.md`;
    const content = readReference(options.skillRoot ?? options.repoRoot, rel, 16_000);
    if (content === null) {
      omitted.push({ source: rel, reason: 'routed skill not found' });
      continue;
    }
    add({ kind: 'skill', source: rel, priority: route.primary ? 740 : 700, content });
  }

  items.sort((a, b) => b.priority - a.priority || a.source.localeCompare(b.source));
  const selected: CompiledContextItem[] = [];
  let used = 0;
  for (const item of items) {
    const cost = estimateTokens(item.content);
    if (selected.length > 0 && used + cost > budget) {
      omitted.push({ source: item.source, reason: `token budget ${budget} exceeded` });
      continue;
    }
    selected.push(item);
    used += cost;
  }
  const requestedRoots = searchRoots(packet, options.repoRoot);
  const requestedSymbols = [...packet.context?.symbols ?? []];
  const localizedSymbols = selected.filter((item) => item.kind === 'symbol').map((item) => item.source.split(' via ')[0]);
  return {
    task_id: packet.task_id,
    items: selected,
    estimated_tokens: used,
    omitted,
    retrieval,
    localization: {
      requested_roots: requestedRoots,
      localized_entrypoints: selected.filter((item) => item.kind === 'entrypoint').map((item) => item.source),
      localized_symbols: localizedSymbols,
      unresolved_symbols: requestedSymbols.filter((symbol) => !localizedSymbols.includes(symbol)),
      retrieval_mode: options.semanticResolver ? 'hybrid' : 'lexical',
      bounded: true,
    },
  };
}
