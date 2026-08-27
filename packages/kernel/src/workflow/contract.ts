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
  /** Native client identity is evidence, not an inferred host-wide claim. */
  host?: string;
  client?: string;
  environment?: string;
  profile?: string;
  effective_config_path?: string;
  executable_path?: string;
  session_id?: string;
  raw_intent?: string;
  reference_inputs?: string[];
  owned_scope?: string[];
  forbidden_scope?: string[];
  proof_selection?: string[];
  last_failure?: string;
  next_action: string;
}
