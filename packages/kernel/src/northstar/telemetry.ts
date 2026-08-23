export interface ReachabilityTelemetryData {
  required_capabilities: string[];
  selected_capabilities: string[];
  projected_capabilities: string[];
  native_discovered_capabilities: string[];
  false_native_discoveries: string[];
  activated_capabilities: string[];
  effect_proven_capabilities: string[];
  attempted_decision_violations: number;
  detected_decision_violations: number;
  escaped_decision_violations: number;
  stale_sessions_unwarned: number;
  total_sessions: number;
  internal_revision_count: number;
  visible_revision_count: number;
}

export interface ReachabilityMetrics {
  required_capability_recall: number;
  required_skill_recall: number;
  native_discovery_rate: number;
  false_native_discovery_rate: number;
  selected_but_not_activated_rate: number;
  activated_but_effect_unproven_rate: number;
  decision_violation_detection_rate: number;
  decision_gap_escape_rate: number;
  session_staleness_rate: number;
  internal_revision_count: number;
  visible_revision_count: number;
}

export function computeReachabilityMetrics(data: ReachabilityTelemetryData): ReachabilityMetrics {
  const reqTotal = data.required_capabilities.length;
  const reqSelected = data.required_capabilities.filter((c) => data.selected_capabilities.includes(c)).length;
  const required_capability_recall = reqTotal > 0 ? reqSelected / reqTotal : 1.0;

  const projTotal = data.projected_capabilities.length;
  const projDiscovered = data.projected_capabilities.filter((c) => data.native_discovered_capabilities.includes(c)).length;
  const native_discovery_rate = projTotal > 0 ? projDiscovered / projTotal : 1.0;

  const totalReported = data.native_discovered_capabilities.length + data.false_native_discoveries.length;
  const false_native_discovery_rate = totalReported > 0 ? data.false_native_discoveries.length / totalReported : 0.0;

  const selTotal = data.selected_capabilities.length;
  const notActivated = data.selected_capabilities.filter((c) => !data.activated_capabilities.includes(c)).length;
  const selected_but_not_activated_rate = selTotal > 0 ? notActivated / selTotal : 0.0;

  const actTotal = data.activated_capabilities.length;
  const unproven = data.activated_capabilities.filter((c) => !data.effect_proven_capabilities.includes(c)).length;
  const activated_but_effect_unproven_rate = actTotal > 0 ? unproven / actTotal : 0.0;

  const attemptedViolations = data.attempted_decision_violations;
  const detectedViolations = data.detected_decision_violations;
  const decision_violation_detection_rate = attemptedViolations > 0 ? detectedViolations / attemptedViolations : 1.0;

  const escapedViolations = data.escaped_decision_violations;
  const totalDecisions = attemptedViolations + escapedViolations;
  const decision_gap_escape_rate = totalDecisions > 0 ? escapedViolations / totalDecisions : 0.0;

  const totalSessions = Math.max(1, data.total_sessions);
  const session_staleness_rate = data.stale_sessions_unwarned / totalSessions;

  return {
    required_capability_recall,
    required_skill_recall: required_capability_recall,
    native_discovery_rate,
    false_native_discovery_rate,
    selected_but_not_activated_rate,
    activated_but_effect_unproven_rate,
    decision_violation_detection_rate,
    decision_gap_escape_rate,
    session_staleness_rate,
    internal_revision_count: data.internal_revision_count,
    visible_revision_count: data.visible_revision_count,
  };
}
