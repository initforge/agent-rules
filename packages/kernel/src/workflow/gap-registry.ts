import fs from 'node:fs';
import path from 'node:path';

export type GapKind = 'deterministic_failure' | 'owner_decision' | 'repeated_manual_step' | 'owner_correction';
export type GapScope = 'task' | 'project' | 'global';
export interface WorkflowGap { id: string; kind: GapKind; scope: GapScope; summary: string; open: boolean; }

/** Compact project backlog; raw chat and command output never enter this file. */
export function readProjectGaps(repoRoot: string): WorkflowGap[] {
  const file = path.join(repoRoot, '.agent', 'gaps.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { gaps?: WorkflowGap[] };
  return Array.isArray(parsed.gaps) ? parsed.gaps : [];
}
