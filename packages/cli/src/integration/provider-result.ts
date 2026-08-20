import type { RegistryEntry } from "./inventory.js";

/**
 * Provider state model: installation and activation are two independent
 * states and are never merged into a single boolean. Installation uses the
 * canonical proof status semantics (PASS/PARTIAL/BLOCKED/UNSUPPORTED/
 * PRE-EXISTING/NEEDS_USER) shared with the kernel proof contract.
 */

export type ProviderInstallStatus =
  | "PASS"
  | "PARTIAL"
  | "BLOCKED"
  | "UNSUPPORTED"
  | "PRE-EXISTING"
  | "NEEDS_USER";

export type ProviderActivationStatus =
  | "ACTIVE"
  | "NOT_ACTIVATED"
  | "PENDING"
  | "UNVERIFIED"
  | "UNAVAILABLE";

export interface ProviderInstallation {
  status: ProviderInstallStatus;
  /** Pinned version that was installed (or matched by verification). */
  version?: string;
  /** Durable managed installation surface, never a transient cache/config. */
  location?: string;
  evidence?: string;
  reason?: string;
}

export interface ProviderActivation {
  policy: string;
  status: ProviderActivationStatus;
  evidence?: string;
  reason?: string;
}

export interface ProviderResult {
  id: string;
  kind: string;
  policy: string;
  version?: string;
  installation: ProviderInstallation;
  activation: ProviderActivation;
}

export type ProvisionAggregateStatus =
  | "PASS"
  | "PARTIAL"
  | "BLOCKED"
  | "UNSUPPORTED"
  | "NEEDS_USER";

/**
 * Activation is policy-driven and independent from installation. Installing
 * an MCP never implies it is active; explicit-only/claim-driven providers
 * report NOT_ACTIVATED, automatic providers report a pending attach.
 */
export function activationFor(entry: Pick<RegistryEntry, "id" | "activation">): ProviderActivation {
  const policy = entry.activation ?? "automatic";
  switch (policy) {
    case "explicit-only":
      return { policy, status: "NOT_ACTIVATED", reason: "explicit-only: activation requires explicit operator selection" };
    case "claim-driven":
      return { policy, status: "NOT_ACTIVATED", reason: "claim-driven: activated only when a routed claim requires it" };
    case "automatic":
      return { policy, status: "PENDING", reason: "installed; activation follows host runtime attach policy" };
    default:
      return { policy, status: "UNVERIFIED", reason: `unknown activation policy: ${policy}` };
  }
}

const SEVERITY: Record<ProviderInstallStatus, number> = {
  PASS: 0,
  "PRE-EXISTING": 0,
  PARTIAL: 1,
  NEEDS_USER: 2,
  UNSUPPORTED: 3,
  BLOCKED: 4,
};

/**
 * Aggregate MCP provisioning. Full-install success requires every MCP to be
 * PASS or PRE-EXISTING (PRE-EXISTING only counts when current verify PASSes,
 * which the orchestrator guarantees). BLOCKED/UNSUPPORTED/NEEDS_USER never
 * become success; a single blocked MCP poisons the aggregate.
 */
export function aggregateProvisioning(results: ProviderResult[]): {
  status: ProvisionAggregateStatus;
  success: boolean;
} {
  let status: ProvisionAggregateStatus = "PASS";
  for (const result of results) {
    const candidate = result.installation.status;
    // PRE-EXISTING (severity 0) can never outrank PASS, so the aggregate never
    // reports PRE-EXISTING itself; PASS/PRE-EXISTING both count as success.
    if (SEVERITY[candidate] > SEVERITY[status]) status = candidate as ProvisionAggregateStatus;
  }
  return { status, success: status === "PASS" };
}