import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';

export interface Detection { host: HostId; present: boolean; binaryPath?: string; homeDir: string; signals: string[]; }
export interface InventoryEntry { host: HostId; kind: 'owned' | 'unmanaged' | 'stale' | 'duplicate' | 'malformed'; path: string; owned: boolean; sha256?: string; }
export interface InstallPlan { host: HostId; changes: Array<{ path: string; op: 'write' | 'remove' | 'patch'; sha256?: string }>; backupDir: string; }
export interface ClaimVerification { status: 'PASS' | 'FAIL' | 'NEEDS_USER' | 'BLOCKED' | 'UNSUPPORTED' | 'STALE'; evidence: unknown[]; omitted_reason?: string | null; }
export interface CertificationReceipt {
  schema: 'agent-rules/host-certification-receipt'; version: 1; host: HostId; generated_at: string; git_head: string; candidate_fingerprint?: string;
  status: 'Ready' | 'Needs action' | 'Unsupported';
  /** Config usability: host is present and its native rules/skills/MCP
   * registrations were actually read back. */
  usable: boolean;
  claims: {
    HOST_PRESENT: ClaimVerification;
    NATIVE_INSTALLED: ClaimVerification;
    NATIVE_DISCOVERED: ClaimVerification;
    NATIVE_LIFECYCLE: ClaimVerification;
    NATIVE_POLICY: ClaimVerification;
    NATIVE_SKILLS: ClaimVerification;
    NATIVE_MCP: ClaimVerification;
    MODEL_BEHAVIOR: ClaimVerification;
    ROLLBACK_VERIFIED: ClaimVerification;
    [key: string]: ClaimVerification;
  };
  axes?: {
    infrastructure: { status: 'PASS' | 'FAIL' | 'UNSUPPORTED'; present: boolean; installed: boolean; catalog_valid: boolean; mcp_registered: boolean };
    routing: { status: 'PASS' | 'FAIL' | 'UNSUPPORTED'; lifecycle_seam: string; policy_effective: boolean; canonical_router_bound: boolean };
    behavior: { status: 'PASS' | 'NEEDS_USER' | 'UNSUPPORTED'; model_turn_verified: boolean; mcp_observed_effect: boolean };
  };
  native_readback: unknown; mcp_handshake: unknown; skill_catalog: unknown;
}
