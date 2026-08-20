import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * REQ-012 — ContextBudgetReceipt.
 *
 * Emitted per run at the actual host edge and aggregated per trusted PASS. It
 * measures:
 *   - installed graph size (files/nodes + estimated tokens of what is installed);
 *   - actual selected/model-visible rule, skill metadata/body, tool schema, MCP
 *     schema and subagent advertisement (NOT the whole installed graph);
 *   - tool result / repair / repeated / total input tokens;
 *   - measurement source HOST_OBSERVED | EXACT_SERIALIZED | ESTIMATED.
 *
 * The pipeline principle: stable minimal bootstrap -> objective -> relevant
 * RepoFacts/TaskFacts -> capability/skill metadata -> selected body/reference on
 * demand -> selected proof -> failure-local repair. Inactive plans, old
 * receipts, cold references and unused tools/MCP/subagents never enter normal
 * model-visible context.
 */

export type ContextMeasurementSource = 'HOST_OBSERVED' | 'EXACT_SERIALIZED' | 'ESTIMATED';

export interface ContextBudgetReceipt {
  schema: 'agent-rules/context-budget-receipt/v1';
  version: 1;
  run_id: string;
  work_id: string;
  generated_at: string;
  measurement_source: ContextMeasurementSource;
  installed_graph: {
    files: number;
    nodes: number;
    estimated_tokens: number;
  };
  model_visible: {
    rules: { count: number; tokens: number };
    skill_metadata: { count: number; tokens: number };
    skill_bodies: { count: number; tokens: number };
    tool_schemas: { count: number; tokens: number };
    mcp_schemas: { count: number; tokens: number };
    subagent_advertisements: { count: number; tokens: number };
    total_tokens: number;
  };
  input_tokens: {
    tool_results: number;
    repair_retries: number;
    repeated_reads: number;
    total: number;
  };
  excluded: Array<{ kind: string; count: number; reason: string }>;
  receipt_sha256: string;
}

export interface ContextBudgetInput {
  run_id: string;
  work_id: string;
  measurement_source: ContextMeasurementSource;
  installed_graph?: { files: number; nodes: number; estimated_tokens: number };
  model_visible?: {
    rules?: Array<{ tokens: number }>;
    skill_metadata?: Array<{ tokens: number }>;
    skill_bodies?: Array<{ tokens: number }>;
    tool_schemas?: Array<{ tokens: number }>;
    mcp_schemas?: Array<{ tokens: number }>;
    subagent_advertisements?: Array<{ tokens: number }>;
  };
  input_tokens?: {
    tool_results?: number;
    repair_retries?: number;
    repeated_reads?: number;
  };
  excluded?: Array<{ kind: string; count: number; reason: string }>;
  generated_at?: string;
}

const sum = (items: Array<{ tokens: number }> | undefined): number => (items ?? []).reduce((n, item) => n + item.tokens, 0);

export function buildContextBudgetReceipt(input: ContextBudgetInput): ContextBudgetReceipt {
  const rules = input.model_visible?.rules ?? [];
  const skillMetadata = input.model_visible?.skill_metadata ?? [];
  const skillBodies = input.model_visible?.skill_bodies ?? [];
  const toolSchemas = input.model_visible?.tool_schemas ?? [];
  const mcpSchemas = input.model_visible?.mcp_schemas ?? [];
  const subagentAds = input.model_visible?.subagent_advertisements ?? [];
  const totalVisible = sum(rules) + sum(skillMetadata) + sum(skillBodies) + sum(toolSchemas) + sum(mcpSchemas) + sum(subagentAds);

  const toolResults = input.input_tokens?.tool_results ?? 0;
  const repairRetries = input.input_tokens?.repair_retries ?? 0;
  const repeatedReads = input.input_tokens?.repeated_reads ?? 0;

  const body = {
    schema: 'agent-rules/context-budget-receipt/v1' as const,
    version: 1 as const,
    run_id: input.run_id,
    work_id: input.work_id,
    generated_at: input.generated_at ?? new Date().toISOString(),
    measurement_source: input.measurement_source,
    installed_graph: input.installed_graph ?? { files: 0, nodes: 0, estimated_tokens: 0 },
    model_visible: {
      rules: { count: rules.length, tokens: sum(rules) },
      skill_metadata: { count: skillMetadata.length, tokens: sum(skillMetadata) },
      skill_bodies: { count: skillBodies.length, tokens: sum(skillBodies) },
      tool_schemas: { count: toolSchemas.length, tokens: sum(toolSchemas) },
      mcp_schemas: { count: mcpSchemas.length, tokens: sum(mcpSchemas) },
      subagent_advertisements: { count: subagentAds.length, tokens: sum(subagentAds) },
      total_tokens: totalVisible,
    },
    input_tokens: {
      tool_results: toolResults,
      repair_retries: repairRetries,
      repeated_reads: repeatedReads,
      total: toolResults + repairRetries + repeatedReads,
    },
    excluded: input.excluded ?? [],
  };
  const receipt = { ...body, receipt_sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  return receipt;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 3.6);

/** Walk an installed graph (directory tree) and estimate its token size. */
export function estimateInstalledGraph(root: string): { files: number; nodes: number; estimated_tokens: number } {
  let files = 0;
  let nodes = 0;
  let bytes = 0;
  const visit = (dir: string): void => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        nodes += 1;
        visit(full);
      } else if (entry.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
  return { files, nodes, estimated_tokens: estimateTokens(String(bytes).length > 0 ? String(bytes) : '0') + Math.ceil(bytes / 3.6) };
}

export { estimateTokens };
