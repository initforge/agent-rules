import type { TaskPacket, WorkSpec } from './protocol.js';

export const PENCIL_PROVIDER_ID = 'pencil-mcp';
export const PENCIL_CAPABILITIES = [
  'design.inspect',
  'design.compose',
  'design.render',
  'design.tokens',
] as const;

const PENCIL_MARKER = /\b(?:pencil(?:-mcp)?|pen\.dev)\b/i;
const PENCIL_NEGATION = /\b(?:don't|do not|without|never|avoid|not use|not using|không\s+(?:dùng|sử dụng))\s+(?:pencil(?:-mcp)?|pen\.dev)\b/i;

function values(...groups: Array<readonly string[] | undefined>): string[] {
  return groups.flatMap((group) => group ?? []);
}

/**
 * Preserve explicit Pencil intent across the raw request and planner output.
 * Generic UI/design vocabulary is deliberately absent: only an explicit
 * provider marker can activate this host-interactive integration.
 */
export function pencilRoutingText(packet: TaskPacket, rawIntent?: string, spec?: WorkSpec): string {
  return [
    rawIntent ?? '',
    packet.goal,
    ...values(packet.constraints, packet.skills, packet.capabilities),
    ...values(packet.context?.references, packet.context?.entrypoints, packet.context?.symbols, packet.context?.decisions),
    ...values(spec?.constraints, spec?.decisions, spec?.known, spec?.assumed, spec?.requires_user),
  ].join('\n');
}

export function hasExplicitPencilIntent(packet: TaskPacket, rawIntent?: string, spec?: WorkSpec): boolean {
  const text = pencilRoutingText(packet, rawIntent, spec);
  return PENCIL_MARKER.test(text) && !PENCIL_NEGATION.test(text);
}

/** Return the complete design surface when Pencil was explicitly requested. */
export function pencilCapabilitiesFor(packet: TaskPacket, rawIntent?: string, spec?: WorkSpec): string[] {
  if (!hasExplicitPencilIntent(packet, rawIntent, spec)) return [];
  return [...new Set([
    ...(packet.capabilities ?? []).filter((capability) => capability.startsWith('design.')),
    ...PENCIL_CAPABILITIES,
  ])];
}
