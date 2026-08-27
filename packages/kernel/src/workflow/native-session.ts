import type { TaskContext } from './contract.js';

/**
 * Narrow shared API for official host hooks/extensions. It deliberately does
 * not execute a second agent: a host owns its own model loop, permissions,
 * cancellation and compaction. The adapter only binds that loop to the
 * already-compiled WorkPacket/TaskContext and emits deduplicable facts.
 */
export interface NativeSessionBinding {
  host: string;
  client: string;
  environment?: string;
  profile?: string;
  effectiveConfigPath?: string;
  executablePath?: string;
  sessionId: string;
  packetId: string;
  contextGeneration: number;
}

export type NativeSessionEventKind = 'input' | 'before_tool' | 'tool_result' | 'checkpoint' | 'completed' | 'cancelled';

export interface NativeSessionEvent {
  id: string;
  kind: NativeSessionEventKind;
  session_id: string;
  packet_id: string;
  context_generation: number;
  observed_at: string;
  detail?: string;
}

export function nativeSessionEvent(binding: NativeSessionBinding, kind: NativeSessionEventKind, detail?: string): NativeSessionEvent {
  return {
    id: `${binding.sessionId}:${binding.packetId}:${binding.contextGeneration}:${kind}`,
    kind,
    session_id: binding.sessionId,
    packet_id: binding.packetId,
    context_generation: binding.contextGeneration,
    observed_at: new Date().toISOString(),
    ...(detail ? { detail } : {}),
  };
}

export function bindTaskContextToNativeSession(context: TaskContext, binding: NativeSessionBinding): TaskContext {
  return {
    ...context,
    host: binding.host,
    client: binding.client,
    environment: binding.environment,
    profile: binding.profile,
    effective_config_path: binding.effectiveConfigPath,
    executable_path: binding.executablePath,
    session_id: binding.sessionId,
    packet_id: binding.packetId,
    generation: binding.contextGeneration,
  };
}
