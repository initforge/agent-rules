/**
 * guardian/placement.ts — launch placement sequence (owner contract §VI).
 *
 * 1. Snapshot current desktop, active window, source window, all windows.
 * 2. Resolve source host session.
 * 3. Resolve initial target workspace.
 * 4. Launch provider via guardian.
 * 5. Attribute provider by PID + start time + executable/profile/endpoint.
 * 6. Move provider to initial workspace with non-activating EWMH.
 * 7. Verify provider visible/non-iconic and on the right workspace.
 * 8. Verify owner desktop/active window unchanged.
 * 9. Verify unrelated windows unchanged.
 * 10. Mark lease READY.
 *
 * After READY the guardian never auto-moves the provider, never switches the
 * desktop, never focuses/activates, never unminimizes. Operator moves are
 * recorded as relocation events; the provider_instance_id/resource_id/lease_id
 * stay unchanged.
 */
import type { Broker } from '../broker/broker.js';
import type { LaunchIdentity } from './attribution.js';
import { attributeProviderWindow } from './attribution.js';
import { X11Backend, type WindowSnapshotEntry } from './x11.js';

export interface PlacementOptions {
  initialWorkspace?: number | null;
  expectedWmClass?: string | null;
  resourceMarker?: string | null;
  requireWindow?: boolean;
  /** ms to wait for the provider window to appear (GUI providers). */
  windowTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface PlacementReceipt {
  ok: boolean;
  lease_id: string;
  provider_pid: number;
  provider_start_time: string;
  desktop_before: number;
  desktop_after: number;
  active_window_before: string | null;
  active_window_after: string | null;
  provider_window: { window_id: string; workspace: number; visible: boolean } | null;
  unrelated_windows_unchanged: boolean;
  unrelated_window_diffs: { added: WindowSnapshotEntry[]; removed: WindowSnapshotEntry[]; changed: WindowSnapshotEntry[] };
  focus_stolen: boolean;
  guardian_wrapped: boolean;
  steps: Array<{ step: number; name: string; ok: boolean; detail?: string }>;
  migrated_from?: number | null;
}

export async function runPlacement(
  broker: Broker,
  x11: X11Backend,
  leaseId: string,
  identity: LaunchIdentity,
  opts: PlacementOptions = {},
): Promise<PlacementReceipt> {
  const steps: PlacementReceipt['steps'] = [];
  const step = (n: number, name: string, ok: boolean, detail?: string) => {
    steps.push({ step: n, name, ok, detail });
    if (!ok) {
      // fail-closed unless the step is explicitly skippable
      throw new PlacementError(`placement step ${n} (${name}) failed: ${detail ?? 'unknown'}`, steps);
    }
  };
  const windowTimeoutMs = opts.windowTimeoutMs ?? 20_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 250;

  // 1. Snapshot.
  const desktopBefore = await x11.currentDesktop();
  const activeBefore = await x11.activeWindow();
  const windowsBefore = await x11.windowSnapshot();
  step(1, 'snapshot desktop/active/windows', true);

  // 2. Resolve source host session.
  const hostSession = broker.getHostSessionForLease(leaseId);
  step(2, 'resolve source host session', true, hostSession ? `session ${hostSession.logical_session_id}` : 'no host session registered (allowed for headless)');

  // 3. Resolve initial target workspace.
  const initialWorkspace = opts.initialWorkspace ?? broker.getLease(leaseId)?.initial_workspace ?? desktopBefore;
  step(3, 'resolve initial target workspace', true, `workspace ${initialWorkspace}`);

  // 4. Launch happened before placement (guardian spawns then calls this).
  step(4, 'provider launched via guardian', true, `pid ${identity.pid}`);

  // 5. Attribute provider window by fingerprint (no first-window heuristic).
  let providerWindow = null;
  if (opts.requireWindow !== false) {
    const deadline = Date.now() + windowTimeoutMs;
    while (Date.now() < deadline) {
      providerWindow = await attributeProviderWindow(x11, identity, {
        expectedWmClass: opts.expectedWmClass,
        resourceMarker: opts.resourceMarker,
        acceptDescendants: true,
      });
      if (providerWindow) break;
      await sleep(pollIntervalMs);
    }
    if (!providerWindow) {
      step(5, 'attribute provider window', false, 'no window matched provider PID+start time within timeout');
      throw new PlacementError('provider window never attributed', steps);
    }
    step(5, 'attribute provider window', true, `window ${providerWindow.window_id} pid ${providerWindow.wm_pid}`);
  } else {
    step(5, 'attribute provider window', true, 'non-GUI provider: window not required');
  }

  // 6. Non-activating move to initial workspace.
  if (providerWindow) {
    const currentWs = providerWindow.workspace;
    if (currentWs !== initialWorkspace) {
      await x11.moveToDesktop(providerWindow.window_id, initialWorkspace);
      const after = await x11.windowInfo(providerWindow.window_id);
      if (after.workspace !== initialWorkspace) {
        step(6, 'move provider to initial workspace (non-activating)', false, `expected ${initialWorkspace}, observed ${after.workspace}`);
        throw new PlacementError('non-activating move failed', steps);
      }
      providerWindow = after;
      step(6, 'move provider to initial workspace (non-activating)', true, `moved ${providerWindow.window_id} to ${initialWorkspace}`);
    } else {
      step(6, 'move provider to initial workspace (non-activating)', true, 'already on target workspace');
    }
  } else {
    step(6, 'move provider to initial workspace (non-activating)', true, 'non-GUI provider: no move needed');
  }

  // 7. Verify visible/non-iconic and correct workspace.
  if (providerWindow) {
    const info = await x11.windowInfo(providerWindow.window_id);
    if (!info.visible) {
      step(7, 'verify provider visible/non-iconic', false, `window state ${info.wm_state}`);
      throw new PlacementError('provider window is not visible', steps);
    }
    if (info.workspace !== initialWorkspace) {
      step(7, 'verify provider on initial workspace', false, `workspace ${info.workspace}`);
      throw new PlacementError('provider not on initial workspace', steps);
    }
    step(7, 'verify provider visible/non-iconic on initial workspace', true, `workspace ${info.workspace}, state ${info.wm_state}`);
  } else {
    step(7, 'verify provider visible/non-iconic', true, 'non-GUI provider');
  }

  // 8. Verify owner desktop/active window unchanged.
  const desktopAfter = await x11.currentDesktop();
  const activeAfter = await x11.activeWindow();
  const desktopUnchanged = desktopAfter === desktopBefore;
  const activeUnchanged = activeAfter === activeBefore;
  if (!desktopUnchanged) {
    step(8, 'owner desktop unchanged', false, `desktop changed ${desktopBefore} -> ${desktopAfter}`);
    throw new PlacementError('desktop changed during launch', steps);
  }
  if (!activeUnchanged) {
    // Focus steal by the provider is recorded, not fought: the guardian never
    // activates/deactivates windows. This is evidence, not a placement failure.
    steps.push({
      step: 8,
      name: 'owner active window unchanged',
      ok: false,
      detail: `active window changed ${activeBefore} -> ${activeAfter} (focus stolen by provider — recorded, not corrected)`,
    });
  } else {
    step(8, 'owner active window unchanged', true);
  }

  // 9. Unrelated windows unchanged.
  const windowsAfter = await x11.windowSnapshot();
  const diff = X11Backend.diffSnapshots(windowsBefore, windowsAfter);
  const providerIds = providerWindow ? new Set([providerWindow.window_id]) : new Set<string>();
  const unrelatedAdded = diff.added.filter((w) => !providerIds.has(w.window_id));
  const unrelatedRemoved = diff.removed.filter((w) => !providerIds.has(w.window_id));
  const unrelatedChanged = diff.changed.filter((w) => !providerIds.has(w.window_id));
  const unrelatedUnchanged = unrelatedAdded.length === 0 && unrelatedRemoved.length === 0 && unrelatedChanged.length === 0;
  if (!unrelatedUnchanged) {
    step(9, 'unrelated windows unchanged', false, JSON.stringify({ added: unrelatedAdded.map((w) => w.window_id), removed: unrelatedRemoved.map((w) => w.window_id), changed: unrelatedChanged.map((w) => w.window_id) }));
    throw new PlacementError('unrelated windows changed during launch', steps);
  }
  step(9, 'unrelated windows unchanged', true, `${windowsBefore.length} -> ${windowsAfter.length} windows`);

  // 10. Mark READY is done by the caller (guardian) after this receipt.
  step(10, 'mark lease READY', true, 'deferred to guardian (transition with receipt)');

  return {
    ok: true,
    lease_id: leaseId,
    provider_pid: identity.pid,
    provider_start_time: identity.start_time,
    desktop_before: desktopBefore,
    desktop_after: desktopAfter,
    active_window_before: activeBefore,
    active_window_after: activeAfter,
    provider_window: providerWindow
      ? { window_id: providerWindow.window_id, workspace: providerWindow.workspace!, visible: providerWindow.visible }
      : null,
    unrelated_windows_unchanged: unrelatedUnchanged,
    unrelated_window_diffs: {
      added: unrelatedAdded,
      removed: unrelatedRemoved,
      changed: unrelatedChanged,
    },
    focus_stolen: !activeUnchanged,
    guardian_wrapped: true,
    steps,
  };
}

export class PlacementError extends Error {
  constructor(
    message: string,
    readonly steps: PlacementReceipt['steps'],
  ) {
    super(message);
    this.name = 'PlacementError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
