/**
 * guardian/guardian.ts — MCP guardian.
 *
 * Responsibilities:
 * - lazy provider launch through a guardian-wrapped per-session stdio bridge
 *   (`connect`): the host config command points at the guardian, which spawns
 *   the registry-pinned provider command, attributes process+window, performs
 *   X11 placement, marks the lease READY and then pipes stdio 1:1. No direct
 *   project-level provider bypass is possible: only registry-pinned commands
 *   with a valid lease token are ever spawned.
 * - process safety: terminate only fingerprint-verified trees.
 * - observation: detect relocation/close/minimize as operator events.
 * - reconnect: when the provider MCP process dies but the resource survives,
 *   the next `connect` reattaches the same resource and reports reattach
 *   evidence instead of pretending continuity.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { X11Backend, type ExecBackend } from './x11.js';
import { captureLaunchIdentity, processMatches } from './attribution.js';
import { runPlacement, type PlacementReceipt } from './placement.js';
import { terminateFingerprintedTree, processAlive, procStartTime } from '../util/procfs.js';
import type { Broker } from '../broker/broker.js';
import type { ProviderCapabilityMetadata, WindowFingerprint } from '../types.js';
import { newId } from '../util/hashes.js';

export interface ProviderLaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  display?: string | null;
  expectedWmClass?: string | null;
  resourceMarker?: string | null;
  requireWindow: boolean;
  initialWorkspace?: number | null;
  /**
   * Optional warmup: providers that create their resource lazily (e.g. a
   * browser window only after the first tools/call) can be driven here right
   * after spawn and before window attribution.
   */
  preAttribution?: (child: import('node:child_process').ChildProcess) => Promise<void>;
}

export interface GuardianOptions {
  broker: Broker;
  x11?: X11Backend;
  exec?: ExecBackend;
}

export interface SpawnResult {
  child: ChildProcess;
  identity: { pid: number; start_time: string };
  provider_instance_id: string;
}

export interface ConnectResult {
  ok: boolean;
  placement?: PlacementReceipt;
  error?: string;
  reconnect?: 'reattached' | 'resource-recreated';
  reused?: boolean;
  child?: ChildProcess;
  provider_instance_id?: string;
  identity?: { pid: number; start_time: string };
}

export class Guardian {
  private broker: Broker;
  private x11: X11Backend;

  constructor(opts: GuardianOptions) {
    this.broker = opts.broker;
    this.x11 = opts.x11 ?? new X11Backend(opts.exec);
  }

  /** Resolve the launch spec from a canonical registry entry. */
  resolveLaunchSpec(
    entry: ProviderCapabilityMetadata & { source?: { commandName?: string; package?: string; version?: string }; install?: { type?: string; handler?: string } },
    lease: { lease_id: string; logical_session_id: string; provider_id: string; initial_workspace: number | null; visibility_mode: string },
    extraEnv: Record<string, string> = {},
  ): ProviderLaunchSpec {
    if (!entry.supports_stdio) {
      throw new Error(`provider ${entry.id} does not support stdio; transport must be streamable-http`);
    }
    if (entry.visible_local_allowed === false && lease.visibility_mode === 'visible-local') {
      throw new Error(`provider ${entry.id} forbids visible-local mode (allowUnbound-like launch rejected)`);
    }
    const command = entry.source?.commandName ?? entry.id;
    const args: string[] = [];
    const env: Record<string, string> = {
      ...extraEnv,
      AGENT_RULES_GUARDIAN: '1',
      AGENT_RULES_LEASE_ID: lease.lease_id,
      AGENT_RULES_LOGICAL_SESSION_ID: lease.logical_session_id,
      AGENT_RULES_PROVIDER_ID: lease.provider_id,
    };
    return {
      command,
      args,
      env,
      display: process.env.DISPLAY ?? null,
      expectedWmClass: entry.resource_scope === 'stateless' ? null : undefined,
      resourceMarker: null,
      requireWindow: entry.gui,
      initialWorkspace: lease.initial_workspace,
    };
  }

  /**
   * Spawn the provider (lazy — only called when a session actually connects)
   * and capture its launch identity immediately.
   */
  spawnProvider(spec: ProviderLaunchSpec): SpawnResult {
    const providerInstanceId = newId('provider');
    const env: Record<string, string> = {
      ...process.env,
      ...spec.env,
      AGENT_RULES_PROVIDER_INSTANCE_ID: providerInstanceId,
    };
    if (spec.display !== undefined && spec.display !== null) env.DISPLAY = spec.display;
    const child = spawn(spec.command, spec.args, {
      env,
      cwd: spec.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      shell: false,
    });
    // A failed spawn (e.g. ENOENT) surfaces as an async 'error' event on the
    // ChildProcess; consume it so callers see the failure via the thrown
    // identity error below instead of an unhandled 'error' event.
    child.on('error', () => { /* surfaced via captureLaunchIdentity failure */ });
    const identity = captureLaunchIdentity(child.pid!);
    if (!identity) {
      child.kill();
      throw new Error('failed to capture provider launch identity');
    }
    return { child, identity: { pid: identity.pid, start_time: identity.start_time }, provider_instance_id: providerInstanceId };
  }

  /**
   * Full connect flow (guardian wrapper main path):
   * spawn -> attribute -> place -> READY -> handshake handled by caller.
   */
  async connect(
    leaseId: string,
    token: string,
    spec: ProviderLaunchSpec,
  ): Promise<ConnectResult> {
    let lease;
    try {
      lease = this.broker.resolveLease(leaseId, token);
    } catch (e) {
      return { ok: false, error: `lease rejected: ${(e as Error).message}` };
    }
    if (lease.status !== 'READY' && lease.status !== 'RELOCATED' && lease.status !== 'CREATED' && lease.status !== 'ACQUIRING' && lease.status !== 'STARTING') {
      return { ok: false, error: `lease ${leaseId} not connectable (status ${lease.status})` };
    }
    const from = lease.status;

    // READY/RELOCATED with a live provider: reuse — never spawn a duplicate.
    if ((from === 'READY' || from === 'RELOCATED') && lease.provider_pid && lease.provider_start_time) {
      const now = procStartTime(lease.provider_pid);
      if (now !== null && now === lease.provider_start_time) {
        return {
          ok: true,
          reused: true,
          provider_instance_id: lease.provider_instance_id ?? undefined,
        };
      }
      // provider process died: reconnect path (resource may still be alive).
      this.transitionFrom(leaseId, from, 'RECONNECTING', 'guardian connect: provider process died; attempting reconnect');
    } else {
      // Walk the machine phases explicitly: CREATED -> ACQUIRING -> STARTING.
      // Each step transitions from the ACTUAL persisted status so a lease that
      // already advanced (e.g. a previous attempt left it STARTING) never hits
      // an illegal-transition CAS error.
      if (from === 'CREATED') {
        this.transitionFrom(leaseId, 'CREATED', 'ACQUIRING', 'guardian connect: acquisition started');
      }
      const current = this.broker.getLease(leaseId)!.status;
      if (current === 'ACQUIRING') {
        this.transitionFrom(leaseId, 'ACQUIRING', 'STARTING', 'guardian connect: provider launch requested');
      }
    }
    const reconnecting = this.broker.getLease(leaseId)!.status === 'RECONNECTING';

    let spawned: SpawnResult;
    try {
      spawned = this.spawnProvider(spec);
    } catch (e) {
      // During a reconnect the lease is already RECONNECTING (not STARTING);
      // transition from the ACTUAL status so the machine edge is always legal.
      const failureFrom = this.broker.getLease(leaseId)?.status ?? 'STARTING';
      this.transitionFrom(leaseId, failureFrom, 'FAILED', `provider spawn failed: ${(e as Error).message}`);
      return { ok: false, error: (e as Error).message };
    }

    const identity = { pid: spawned.identity.pid, start_time: spawned.identity.start_time, exe: null, cmdline: [], resource_token: undefined };
    try {
      // Warmup hook: drive the provider to create its resource before
      // attribution (lazy-resource providers, e.g. browser windows).
      if (spec.preAttribution) {
        await spec.preAttribution(spawned.child);
      }
      const placement = await runPlacement(this.broker, this.x11, leaseId, identity, {
        initialWorkspace: spec.initialWorkspace,
        expectedWmClass: spec.expectedWmClass,
        resourceMarker: spec.resourceMarker,
        requireWindow: spec.requireWindow,
      });
      const currentWorkspace = placement.provider_window?.workspace ?? lease.current_workspace;
      // On reconnect, keep the surviving resource identity when the resource
      // window is still alive; otherwise a fresh resource id is recorded
      // (RESOURCE_RECREATED is recorded by the broker via reconnectProvider).
      const resourceAlive = reconnecting && lease.resource_id !== null && lease.provider_window_fingerprints.length > 0;
      const resourceId = resourceAlive
        ? lease.resource_id
        : placement.provider_window
          ? `${lease.provider_id}-window-${placement.provider_window.window_id}`
          : null;
      this.broker.attachProvider(leaseId, token, {
        provider_instance_id: spawned.provider_instance_id,
        mcp_connection_id: newId('conn'),
        resource_id: resourceId,
        provider_pid: spawned.identity.pid,
        provider_start_time: spawned.identity.start_time,
        provider_window_fingerprints: placement.provider_window ? [{
          window_id: placement.provider_window.window_id,
          wm_pid: spawned.identity.pid,
          wm_class: null,
          wm_name: null,
          process_start_time: spawned.identity.start_time,
          workspace: placement.provider_window.workspace,
          wm_state: 1,
          visible: true,
          resource_markers: spec.resourceMarker ? [spec.resourceMarker] : [],
          observed_at: new Date().toISOString(),
        }] : [],
        current_workspace: currentWorkspace,
        transport: 'stdio',
      });
      if (reconnecting) {
        const outcome = resourceAlive ? 'reattached' : 'resource-recreated';
        this.broker.reconnectProvider(leaseId, token, outcome, {
          new_provider_instance_id: spawned.provider_instance_id,
          new_resource_id: resourceAlive ? undefined : resourceId ?? undefined,
          reason: outcome === 'reattached' ? 'provider reattached to surviving resource' : 'resource not alive; new resource recorded',
        });
      }
      const postReconnectStatus = reconnecting ? this.broker.getLease(leaseId)!.status : 'STARTING';
      this.transitionFrom(leaseId, postReconnectStatus, 'READY', 'placement verified; lease READY', {
        guardian_wrapped: placement.guardian_wrapped,
        focus_stolen: placement.focus_stolen,
        unrelated_windows_unchanged: placement.unrelated_windows_unchanged,
        reconnect: reconnecting,
      });
      return {
        ok: true,
        placement,
        child: spawned.child,
        provider_instance_id: spawned.provider_instance_id,
        identity: spawned.identity,
      };
    } catch (e) {
      // Same rule as the spawn failure path: the lease may be RECONNECTING when
      // a reconnect placement fails — always transition from the actual status.
      const failureFrom = this.broker.getLease(leaseId)?.status ?? 'STARTING';
      this.transitionFrom(leaseId, failureFrom, 'FAILED', `placement failed: ${(e as Error).message}`);
      this.terminateProvider(leaseId);
      return { ok: false, error: (e as Error).message };
    }
  }

  private transitionFrom(leaseId: string, from: string, to: string, reason: string, payload: Record<string, unknown> = {}): void {
    // Broker.transition is private; route through a public narrow API.
    this.broker.noteTransition(leaseId, from as never, to as never, reason, payload);
  }

  /** Terminate only the fingerprint-verified provider tree of a lease. */
  terminateProvider(leaseId: string): { terminated: number[]; blocked: number[]; reused: number[] } {
    const lease = this.broker.getLease(leaseId);
    if (!lease || !lease.provider_pid || !lease.provider_start_time) {
      return { terminated: [], blocked: [], reused: [] };
    }
    const now = procStartTime(lease.provider_pid);
    if (now !== null && now !== lease.provider_start_time) {
      // PID reused — never kill; quarantine instead.
      this.broker.noteTransition(leaseId, lease.status, 'QUARANTINED', 'provider PID start time mismatch at termination; BLOCKED', { pid: lease.provider_pid });
      return { terminated: [], blocked: [], reused: [lease.provider_pid] };
    }
    return terminateFingerprintedTree(lease.provider_pid, lease.provider_start_time, { graceMs: 800 });
  }

  /** Observe provider state; operator events become broker transitions. */
  async observe(leaseId: string): Promise<{ workspace?: number; window: WindowFingerprint | null; event?: string }> {
    const lease = this.broker.getLease(leaseId);
    if (!lease) return { window: null };
    const windows = await this.x11.windowSnapshot();
    const target = windows.find((w) => w.wm_pid !== null && lease.provider_window_fingerprints.some((p) => p.window_id === w.window_id));
    if (!target) {
      const alive = lease.provider_pid ? processAlive(lease.provider_pid) : false;
      if (!alive) {
        this.broker.observeProvider(leaseId, { operator_event: 'closed', event_detail: 'provider window and process both gone' });
        return { window: null, event: 'closed' };
      }
      this.broker.observeProvider(leaseId, { operator_event: 'unmapped', event_detail: 'provider window not in client list but process alive' });
      return { window: null, event: 'unmapped' };
    }
    const info = await this.x11.windowInfo(target.window_id);
    if (!info.visible) {
      this.broker.observeProvider(leaseId, { operator_event: 'minimized', event_detail: `window ${target.window_id} iconic` });
    }
    this.broker.observeProvider(leaseId, {
      current_workspace: info.workspace,
      window_fingerprints: [info],
    });
    return { workspace: info.workspace ?? undefined, window: info };
  }
}
