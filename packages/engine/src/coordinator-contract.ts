/** Host-attested contract for a main session that coordinates but never authors. */
export interface CoordinatorOnlyContract {
  readonly role: 'main-coordinator';
  readonly enforcement: 'host' | 'test';
  readonly childDepth: 1;
  readonly trackedFileMutation: 'deny';
  readonly sourceAuthoring: 'deny';
  readonly testAuthoring: 'deny';
  readonly childDispatch: 'allow';
  readonly focusedVerification: 'allow';
  readonly approvedIntegration: 'allow';
}

export const COORDINATOR_ONLY_CONTRACT: CoordinatorOnlyContract = Object.freeze({
  role: 'main-coordinator',
  enforcement: 'host',
  childDepth: 1,
  trackedFileMutation: 'deny',
  sourceAuthoring: 'deny',
  testAuthoring: 'deny',
  childDispatch: 'allow',
  focusedVerification: 'allow',
  approvedIntegration: 'allow',
});

export class CoordinatorContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoordinatorContractError';
  }
}

/** Prompt-only declarations are deliberately not accepted as enforcement. */
export function assertCoordinatorOnlyContract(value: CoordinatorOnlyContract): void {
  const failures: string[] = [];
  if (value.role !== 'main-coordinator') failures.push('role');
  if (value.enforcement !== 'host' && value.enforcement !== 'test') failures.push('enforcement');
  if (value.childDepth !== 1) failures.push('childDepth');
  if (value.trackedFileMutation !== 'deny') failures.push('trackedFileMutation');
  if (value.sourceAuthoring !== 'deny') failures.push('sourceAuthoring');
  if (value.testAuthoring !== 'deny') failures.push('testAuthoring');
  if (value.childDispatch !== 'allow') failures.push('childDispatch');
  if (value.focusedVerification !== 'allow') failures.push('focusedVerification');
  if (value.approvedIntegration !== 'allow') failures.push('approvedIntegration');
  if (failures.length > 0) {
    throw new CoordinatorContractError(`main coordinator contract is not host-enforced: ${failures.join(', ')}`);
  }
}
