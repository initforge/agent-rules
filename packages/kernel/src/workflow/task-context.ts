import type { TaskPacket, WorkRequest, WorkSpec } from '../northstar/protocol.js';
import type { TaskContext } from './contract.js';

/** Build the compact handoff object persisted in the existing task context. */
export function buildTaskContext(input: {
  request: WorkRequest;
  spec: WorkSpec;
  packet: TaskPacket;
  selectedSkills: readonly string[];
  selectedCapabilities: readonly string[];
  nextAction: string;
  native?: {
    host: string;
    client: string;
    environment?: string;
    profile?: string;
    effectiveConfigPath?: string;
    executablePath?: string;
    sessionId?: string;
  };
  proofSelection?: readonly string[];
  lastFailure?: string;
}): TaskContext {
  return {
    request_id: input.request.work_id,
    plan_id: input.spec.spec_id,
    packet_id: input.packet.task_id,
    generation: input.packet.execution_generation ?? input.spec.execution_generation ?? 0,
    locked_decisions: [...(input.packet.context?.decisions ?? [])],
    selected_skills: [...input.selectedSkills],
    selected_capabilities: [...input.selectedCapabilities],
    raw_intent: input.request.raw_intent,
    reference_inputs: [...(input.request.reference_inputs ?? [])],
    owned_scope: [...input.packet.scope.owned],
    forbidden_scope: [...input.packet.scope.forbidden],
    proof_selection: [...(input.proofSelection ?? [])],
    last_failure: input.lastFailure,
    ...(input.native ? {
      host: input.native.host,
      client: input.native.client,
      environment: input.native.environment,
      profile: input.native.profile,
      effective_config_path: input.native.effectiveConfigPath,
      executable_path: input.native.executablePath,
      session_id: input.native.sessionId,
    } : {}),
    next_action: input.nextAction,
  };
}
