/**
 * Public workflow vocabulary. Execution progress is separate from whether a
 * check was observed and passed, so a GUI-only check cannot hide a real defect.
 */
export type WorkflowExecutionPhase = 'queued' | 'running' | 'done';

export interface CheckResult {
  id: string;
  ran: boolean;
  observed: boolean;
  passed?: boolean;
  reason?: 'needs_user' | 'unsupported' | 'blocked';
  evidence_ref?: string;
}

export interface RunSummary {
  active: boolean;
  complete: boolean;
  usable: boolean;
  ship_ready: boolean;
  checks: CheckResult[];
  owner_checks: CheckResult[];
}

export interface TaskContext {
  request_id: string;
  plan_id: string;
  packet_id: string;
  generation: number;
  locked_decisions: string[];
  selected_skills: string[];
  selected_capabilities: string[];
  next_action: string;
}
