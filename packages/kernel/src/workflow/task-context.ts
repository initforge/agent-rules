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
}): TaskContext {
  return {
    request_id: input.request.work_id,
    plan_id: input.spec.spec_id,
    packet_id: input.packet.task_id,
    generation: input.packet.execution_generation ?? input.spec.execution_generation ?? 0,
    locked_decisions: [...(input.packet.context?.decisions ?? [])],
    selected_skills: [...input.selectedSkills],
    selected_capabilities: [...input.selectedCapabilities],
    next_action: input.nextAction,
  };
}
