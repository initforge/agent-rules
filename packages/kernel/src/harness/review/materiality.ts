export interface MaterialityFinding {
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  acceptance_id?: string;
  invariant?: string;
  dimension: string;
  message: string;
  user_impact: string;
}

export interface MaterialityContext {
  relevant_acceptance_ids: string[];
  failed_acceptance_ids?: string[];
}

export interface MaterialityDecision {
  blocking: boolean;
  reason: string;
}

const MATERIAL_P2_DIMENSIONS = new Set([
  'public_contract_compatibility',
  'security_auth_data_migration',
  'runtime_live_host_behavior',
  'recovery_install_rollback',
  'subtractive_preservation',
  'canonical_runtime_adoption',
  'blocker_scope_completion',
  'ui_geometry_behavior',
]);

export function classifyReviewMateriality(finding: MaterialityFinding, context: MaterialityContext): MaterialityDecision {
  if (finding.severity === 'P0' || finding.severity === 'P1') {
    return { blocking: true, reason: `${finding.severity} is always blocking` };
  }
  if (finding.severity === 'P3') return { blocking: false, reason: 'P3 is advisory' };

  const acceptanceBound = typeof finding.acceptance_id === 'string'
    && context.relevant_acceptance_ids.includes(finding.acceptance_id);
  if (!acceptanceBound) return { blocking: false, reason: 'P2 is not bound to an exact relevant acceptance ID' };

  const failedAcceptance = (context.failed_acceptance_ids ?? []).includes(finding.acceptance_id!);
  const materialDimension = MATERIAL_P2_DIMENSIONS.has(finding.dimension);
  const materialText = /material regression|security|authorization|data loss|public contract|production runtime|migration|rollback/i
    .test(`${finding.invariant ?? ''} ${finding.message} ${finding.user_impact}`);
  if (failedAcceptance || materialDimension || materialText) {
    return {
      blocking: true,
      reason: failedAcceptance
        ? `P2 is bound to failed acceptance ${finding.acceptance_id}`
        : `P2 is bound to acceptance ${finding.acceptance_id} and a material production surface`,
    };
  }
  return { blocking: false, reason: `P2 bound to ${finding.acceptance_id} is non-material and remains advisory` };
}
