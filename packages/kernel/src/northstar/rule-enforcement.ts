export interface RuntimeGuardInput {
  readonly changedPaths?: readonly string[];
  readonly completionClaimed?: boolean;
  readonly requiredProofPassed?: boolean;
}

export interface RuntimeGuardResult {
  readonly allowed: boolean;
  readonly reason: string | null;
}

/** Small fail-closed guard for the two invariants that need runtime enforcement. */
export function checkRuntimeGuard(input: RuntimeGuardInput): RuntimeGuardResult {
  if ((input.changedPaths ?? []).some((value) => value === 'generated' || value.startsWith('generated/'))) {
    return { allowed: false, reason: 'edit canonical source and regenerate; generated mirrors are read-only' };
  }
  if (input.completionClaimed === true && input.requiredProofPassed !== true) {
    return { allowed: false, reason: 'completion requires the selected proof to pass' };
  }
  return { allowed: true, reason: null };
}
