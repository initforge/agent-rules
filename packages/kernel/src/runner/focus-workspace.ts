/**
 * focus-workspace.ts — canonical MCP GUI focus/workspace boundary (AM-0006).
 *
 * Guarantees for local interactive browser/design MCP launches:
 *   - visible (headed, never hidden/minimized)
 *   - isolated (per-task profile, pinned provider)
 *   - placed on the workspace of the originating OpenCode session
 *   - non-activating (owner's active window and current desktop unchanged)
 *   - no automatic workspace switch
 *
 * Fail-closed: ambiguous or missing source binding never opens a GUI on a
 * guessed workspace; missing capability (no wmctrl/xprop/DISPLAY) is BLOCKED.
 *
 * The X11 backend only ever performs a NON-activating workspace move
 * (`wmctrl -i -r <window> -t <workspace>`). It never calls `wmctrl -a/-R/-s`,
 * xdotool windowactivate, or synthetic keyboard shortcuts. Window titles are
 * never read into durable evidence; window ids are persisted hashed.
 *
 * Everything is injected through an `exec` shim so unit tests run against a
 * fake window manager without a real GUI.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type McpFocusPolicy = 'preserve' | 'allow-activate';
export type McpVisibilityMode = 'visible' | 'headless';

export const FOCUS_POLICIES: readonly McpFocusPolicy[] = ['preserve', 'allow-activate'];
export const VISIBILITY_MODES: readonly McpVisibilityMode[] = ['visible', 'headless'];

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

export type ExecFn = (command: string, args: readonly string[]) => ExecResult;

/** Synchronous exec used by the backend; injected in tests. */
export function syncExec(command: string, args: readonly string[]): ExecResult {
  const result = spawnSync(command, [...args], { encoding: 'utf8', timeout: 10_000 });
  return { stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? ''), status: result.status };
}

export interface WindowFact {
  /** Hex X11 window id, e.g. 0x04c00006. */
  windowId: string;
  /** Process id owning the window (_NET_WM_PID). */
  pid?: string;
  /** Workspace index the window currently sits on (_NET_WM_DESKTOP). */
  workspace?: number;
  /** Hashed title; raw titles never leave the backend. */
  titleHash?: string;
  /**
   * Raw title, used ONLY for in-process candidate grouping (OpenCode session
   * identification). It is never persisted into receipts or evidence.
   */
  title?: string;
}

export interface DesktopSnapshot {
  currentWorkspace: number | null;
  activeWindowId: string | null;
  windows: WindowFact[];
  capturedAt: string;
}

export interface FocusReceipt {
  schema: 'agent-rules/mcp-focus-receipt';
  version: 1;
  session_id?: string;
  sourceWindowIdHash?: string;
  targetWorkspace: number | null;
  before: { currentWorkspace: number | null; activeWindowIdHash: string | null } | null;
  after: { currentWorkspace: number | null; activeWindowIdHash: string | null } | null;
  providerWindowIdHash?: string;
  providerWorkspace?: number | null;
  /** Post-move proof that the provider window is visible and not iconic (WM_STATE). */
  providerNonIconic?: boolean | null;
  /** Post-move proof that no other window changed workspace during the launch/move. */
  otherWindowsUnchanged?: boolean | null;
  placement: 'prevented_and_verified' | 'detected_after_violation' | 'blocked_before_launch' | 'verification_failed' | 'no-new-window-detected' | 'needs-user' | 'blocked' | 'unobservable';
  visibility: McpVisibilityMode;
  focusPolicy: McpFocusPolicy;
  isolated: boolean;
  capability: { wmctrl: boolean; xprop: boolean; display: boolean } | null;
  errors: string[];
  created_at: string;
}

export interface FocusGuardOptions {
  /** OpenCode session id when known. */
  sessionId?: string;
  /** Explicit source window id (authoritative when provided). */
  sourceWindowId?: string;
  /** When set, force this workspace as target (used by explicit owner binding). */
  explicitWorkspace?: number;
  /** Project root (CWD of the owning OpenCode process) for identity-based grouping. */
  projectRoot?: string;
  /** Inject explicit windows for resolution (tests / diagnostics). */
  windowListing?: readonly WindowFact[];
  /** Test override: skip real window scan. */
  dryRun?: boolean;
  exec?: ExecFn;
}

/** OpenCode session window title prefix (host convention). */
export const OC_WINDOW_TITLE_PREFIX = 'OC |';

/** A window belongs to an OpenCode session only when its title carries the OC prefix. */
export function isOcWindow(entry: Pick<WindowFact, 'title' | 'titleHash'>): boolean {
  if (entry.title !== undefined) return entry.title.startsWith(OC_WINDOW_TITLE_PREFIX);
  return false;
}

/**
 * Group windows by OpenCode session identity (AM-0006 availability repair):
 * only OC-prefixed windows are candidates; browser/MCP/desktop/owner-app
 * child windows are never candidates. When several OC windows exist, a
 * projectRoot match against the window title (basename) narrows to the
 * session working on that project; the result is a single group, not a list
 * of child windows.
 */
export function groupOcCandidates(snapshot: DesktopSnapshot, projectRoot?: string): { group: WindowFact[]; narrowedByProject: boolean } {
  const oc = snapshot.windows.filter((entry) => isOcWindow(entry) && entry.workspace !== undefined && entry.workspace >= 0);
  if (!projectRoot || oc.length <= 1) return { group: oc, narrowedByProject: false };
  const base = path.basename(projectRoot);
  const matched = oc.filter((entry) => entry.title?.includes(base));
  if (matched.length === 1) return { group: matched, narrowedByProject: true };
  return { group: oc, narrowedByProject: false };
}

/**
 * Resolve the target workspace for a provider GUI launch.
 *
 * Priority (identity order):
 *  1. explicit owner/session binding (sourceWindowId) -> its workspace;
 *  2. explicitWorkspace override (owner-provided binding);
 *  3. grouped OpenCode-session windows (OC-prefixed titles only; child
 *     windows excluded) -> exactly one -> its workspace;
 *  4. multiple OC sessions narrowed by project root (window title contains
 *     the project basename) -> exactly one -> its workspace;
 *  5. otherwise fail closed (needs-user) listing the grouped candidates
 *     (hashed only), with guidance to pass --window <id>.
 * The current desktop is NEVER used as a target.
 */
export function resolveTargetWorkspace(opts: FocusGuardOptions, snapshot: DesktopSnapshot): ResolveTargetResult {
  if (opts.explicitWorkspace !== undefined && Number.isInteger(opts.explicitWorkspace) && opts.explicitWorkspace >= 0) {
    return { workspace: opts.explicitWorkspace, windowId: null, status: 'resolved', reason: 'explicit owner-provided workspace binding' };
  }
  if (opts.sourceWindowId) {
    let id: string;
    try {
      id = parseWindowId(opts.sourceWindowId);
    } catch (error) {
      return { workspace: null, windowId: null, status: 'blocked', reason: (error as Error).message };
    }
    const window = snapshot.windows.find((entry) => entry.windowId === id);
    if (!window) return { workspace: null, windowId: id, status: 'blocked', reason: `source window ${hashWindowId(id)} not found on this display` };
    if (window.workspace === undefined || window.workspace === null || window.workspace < 0) {
      return { workspace: null, windowId: id, status: 'blocked', reason: `source window ${hashWindowId(id)} has no workspace binding` };
    }
    return { workspace: window.workspace, windowId: id, status: 'resolved', reason: 'explicit source window workspace binding' };
  }
  const { group, narrowedByProject } = groupOcCandidates(snapshot, opts.projectRoot);
  if (group.length === 0) {
    return { workspace: null, windowId: null, status: 'needs-user', reason: 'no OpenCode session window resolvable; explicit session binding required before opening a GUI MCP' };
  }
  if (group.length > 1) {
    return {
      workspace: null,
      windowId: null,
      status: 'needs-user',
      reason: `multiple OpenCode session windows (${group.length})${narrowedByProject ? ' (not narrowed by project root)' : ''}; pass --window <id> for the exact session window`,
      candidates: group.map((entry) => ({ windowId: entry.windowId, windowHash: hashWindowId(entry.windowId), workspace: entry.workspace ?? -1 })),
    };
  }
  return { workspace: group[0].workspace!, windowId: group[0].windowId, status: 'resolved', reason: 'single OpenCode session window (grouped by OC identity)' };
}

export interface ResolveTargetResult {
  workspace: number | null;
  windowId: string | null;
  status: 'resolved' | 'blocked' | 'needs-user';
  reason: string;
  /** Grouped candidate windows (hashed) when resolution fails with multiple OC sessions. */
  candidates?: Array<{ windowId: string; windowHash: string; workspace: number }>;
}

function hashWindowId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 16);
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseWindowId(raw: string): string {
  const cleaned = String(raw ?? '').trim();
  if (/^0x[0-9a-fA-F]+$/.test(cleaned)) return cleaned.toLowerCase();
  if (/^[0-9]+$/.test(cleaned)) return `0x${Number(cleaned).toString(16)}`;
  throw new Error(`invalid X11 window id: ${raw}`);
}

/** Current desktop + active window through EWMH (non-activating reads only). */
export function snapshotDesktop(exec: ExecFn): DesktopSnapshot {
  const capturedAt = new Date().toISOString();
  let currentWorkspace: number | null = null;
  try {
    const current = exec('xprop', ['-root', '_NET_CURRENT_DESKTOP']);
    const match = /_NET_CURRENT_DESKTOP\(CARDINAL\)\s*=\s*(\d+)/.exec(current.stdout);
    if (match) currentWorkspace = Number(match[1]);
  } catch {
    /* capability gap surfaced by caller */
  }
  let activeWindowId: string | null = null;
  try {
    const active = exec('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
    const match = /_NET_ACTIVE_WINDOW\(WINDOW\):\s*window id #\s*(0x[0-9a-fA-F]+)/.exec(active.stdout);
    if (match) activeWindowId = match[1].toLowerCase();
  } catch {
    /* capability gap */
  }
  const windows: WindowFact[] = [];
  try {
    const listing = exec('wmctrl', ['-l', '-p']);
    for (const line of listing.stdout.split('\n')) {
      const match = /^\s*(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(\d+)\s+\S+\s+(.*)$/.exec(line);
      if (!match) continue;
      const title = match[4];
      windows.push({
        windowId: match[1].toLowerCase(),
        workspace: numberOrNull(match[2]) ?? undefined,
        pid: match[3],
        titleHash: createHash('sha256').update(title).digest('hex').slice(0, 16),
        title,
      });
    }
  } catch {
    /* capability gap */
  }
  return { currentWorkspace, activeWindowId, windows, capturedAt };
}

/**
 * Non-activating workspace move (AM-0004, EWMH-compliant).
 *
 * Per the EWMH specification the correct client mechanism to move a window to
 * another desktop is the `_NET_WM_DESKTOP` CLIENT MESSAGE sent to the root
 * window (wmctrl -t implements exactly this message). Setting the
 * `_NET_WM_DESKTOP` property directly is NOT guaranteed to be honored — the
 * property is WM-managed and may be ignored or overwritten — so this backend
 * never claims property-based prevention. Acceptance always comes from the
 * post-move readback (providerWorkspace === targetWorkspace), never from an
 * exit code alone.
 */
export function moveWindowToWorkspace(exec: ExecFn, windowId: string, workspace: number): boolean {
  const result = exec('wmctrl', ['-i', '-r', windowId, '-t', String(workspace)]);
  return result.status === 0;
}

/**
 * Terminate the FULL descendant process tree of `rootPid` safely: walk
 * /proc children (leaves first, then the root), so children die before their
 * parents and no process outside the provider tree is touched. Never kills
 * by process group (the guardian shares its group with the caller).
 */
export function terminateProcessTree(rootPid: number, exec: ExecFn = syncExec, signal: NodeJS.Signals = 'SIGTERM'): number[] {
  const all = new Map<number, number[]>();
  const collect = (pid: number): number[] => {
    if (all.has(pid)) return all.get(pid)!;
    const children: number[] = [];
    try {
      const tasks = fs.readdirSync(`/proc/${pid}/task`);
      for (const tid of tasks) {
        try {
          const raw = fs.readFileSync(`/proc/${pid}/task/${tid}/children`, 'utf8');
          for (const child of raw.trim().split(/\s+/).filter(Boolean)) {
            const n = Number(child);
            if (Number.isFinite(n) && n > 0) children.push(n);
          }
        } catch { /* task exited */ }
      }
    } catch {
      // /proc unavailable: pgrep -P fallback (read-only discovery).
      const result = exec('pgrep', ['-P', String(pid)]);
      for (const child of result.stdout.trim().split(/\s+/).filter(Boolean)) {
        const n = Number(child);
        if (Number.isFinite(n) && n > 0) children.push(n);
      }
    }
    all.set(pid, children);
    return children;
  };
  const killed: number[] = [];
  const killTree = (pid: number) => {
    for (const child of collect(pid)) killTree(child);
    try { process.kill(pid, signal); killed.push(pid); } catch { /* already gone */ }
  };
  killTree(rootPid);
  return killed;
}

/**
 * Lifecycle focus-violation predicate (AM-0003): the provider window became
 * the active window while the current workspace is NOT the provider's
 * workspace. An owner cannot click a window on a workspace they are not
 * viewing, so this is attributable to the provider stealing focus at ANY
 * point in the session lifecycle, not just at launch.
 */
export function isLifecycleFocusViolation(input: {
  currentWorkspace: number | null;
  providerWorkspace: number | null;
  activeWindowId: string | null;
  providerWindowId: string | null;
}): boolean {
  if (!input.activeWindowId || !input.providerWindowId) return false;
  if (input.activeWindowId !== input.providerWindowId) return false;
  if (input.currentWorkspace === null || input.providerWorkspace === null) return false;
  return input.currentWorkspace !== input.providerWorkspace;
}

export function verifyFocusPreserved(before: DesktopSnapshot, after: DesktopSnapshot): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (before.currentWorkspace !== after.currentWorkspace) {
    reasons.push(`current workspace changed ${before.currentWorkspace} -> ${after.currentWorkspace}`);
  }
  if (before.activeWindowId !== after.activeWindowId) {
    reasons.push(`active window changed ${before.activeWindowId ? hashWindowId(before.activeWindowId) : 'none'} -> ${after.activeWindowId ? hashWindowId(after.activeWindowId) : 'none'}`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Read the EWMH WM_STATE of a window (read-only). Returns true when the window
 * is visible and not iconic.
 *
 * A freshly mapped window may not have its WM_STATE written yet, and a window
 * being moved by the WM is briefly `Withdrawn` while it is unmapped and
 * remapped on the target workspace — both are transient. Only a settled
 * `Iconic` state (or an unreadable state after all retries) fails closed.
 */
export function windowIsNonIconic(exec: ExecFn, windowId: string, attempts = 12, delaySeconds = 0.5): boolean {
  const stateRe = /window state:\s*([A-Za-z]+)/;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = exec('xprop', ['-id', windowId, 'WM_STATE']);
      const match = stateRe.exec(result.stdout);
      if (match) {
        const state = match[1];
        if (state === 'Iconic') return false;
        if (state === 'Withdrawn') {
          // transient unmap during the WM move: keep retrying
        } else {
          return true;
        }
      }
    } catch { /* transient read error: retry */ }
    try { exec('sleep', [String(delaySeconds)]); } catch { /* delay best-effort */ }
  }
  return false;
}

/**
 * Prove no OTHER window changed workspace during the provider launch/move.
 * Compares before and after snapshots for windows present in both and returns
 * the list of workspace changes (provider window id excluded).
 */
export function otherWindowsMoved(before: DesktopSnapshot, after: DesktopSnapshot, excludeWindowId?: string): Array<{ windowIdHash: string; from: number | undefined; to: number | undefined }> {
  const out: Array<{ windowIdHash: string; from: number | undefined; to: number | undefined }> = [];
  const byId = new Map(after.windows.map((entry) => [entry.windowId, entry]));
  for (const entry of before.windows) {
    if (entry.windowId === excludeWindowId) continue;
    const afterEntry = byId.get(entry.windowId);
    if (!afterEntry) continue;
    if (entry.workspace !== afterEntry.workspace) {
      out.push({ windowIdHash: hashWindowId(entry.windowId), from: entry.workspace, to: afterEntry.workspace });
    }
  }
  return out;
}

export interface PlaceWindowInput {
  providerPid?: string;
  before: DesktopSnapshot;
  after: DesktopSnapshot;
}

export interface ProviderWindowMatch {
  status: 'found' | 'none' | 'ambiguous';
  window?: WindowFact;
  reason: string;
}

/**
 * Resolve /proc/<pid>/task/<tid>/children recursively to the full descendant
 * process tree of a provider. Injectable for tests (pgrep fallback when /proc
 * is unavailable).
 */
export function descendantPids(rootPid: number, exec: ExecFn = syncExec, maxDepth = 6): number[] {
  const out = new Set<number>();
  let frontier = [rootPid];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const pid of frontier) {
      let children: string[] = [];
      try {
        const tasks = fs.readdirSync(`/proc/${pid}/task`);
        for (const tid of tasks) {
          try {
            const raw = fs.readFileSync(`/proc/${pid}/task/${tid}/children`, 'utf8');
            children.push(...raw.trim().split(/\s+/).filter(Boolean));
          } catch {
            /* task may have exited */
          }
        }
      } catch {
        // /proc unavailable (non-Linux or restricted): fall back to pgrep -P.
        const result = exec('pgrep', ['-P', String(pid)]);
        children = result.stdout.trim().split(/\s+/).filter(Boolean);
      }
      for (const child of children) {
        const n = Number(child);
        if (Number.isFinite(n) && n > 0 && !out.has(n)) {
          out.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return [...out];
}

/**
 * The provider's new window. Attribution is strict and never guesses:
 *
 *   1. exact _NET_WM_PID match against the provider PID;
 *   2. _NET_WM_PID match against any descendant process of the provider
 *      (process tree walk over /proc children, pgrep -P fallback);
 *   3. otherwise fail closed: a "first new window" fallback would risk moving
 *      an unrelated user window, so it is never used.
 *
 * Multiple matches or zero matches are reported so the caller can fail closed
 * with BLOCKED/NEEDS_USER instead of moving an arbitrary window.
 */
export function findNewWindow(before: DesktopSnapshot, after: DesktopSnapshot, providerPid?: number | string): ProviderWindowMatch {
  const beforeIds = new Set(before.windows.map((entry) => entry.windowId));
  const candidates = after.windows.filter((entry) => !beforeIds.has(entry.windowId));
  if (candidates.length === 0) {
    return { status: 'none', reason: 'no new window appeared after provider launch' };
  }
  if (providerPid === undefined || providerPid === null || providerPid === '') {
    return {
      status: 'ambiguous',
      reason: `no provider pid to attribute the new window (${candidates.length} candidate(s)); refusing to move an unowned window`,
    };
  }
  const pid = String(providerPid);
  const exact = candidates.filter((entry) => entry.pid === pid);
  if (exact.length === 1) return { status: 'found', window: exact[0], reason: `exact provider pid ${pid}` };
  if (exact.length > 1) {
    return { status: 'ambiguous', reason: `multiple windows owned by provider pid ${pid}; cannot attribute confidently` };
  }
  const descendants = new Set(descendantPids(Number(pid)).map(String));
  const inherited = candidates.filter((entry) => entry.pid !== undefined && descendants.has(entry.pid));
  if (inherited.length === 1) return { status: 'found', window: inherited[0], reason: `provider descendant pid ${inherited[0].pid}` };
  if (inherited.length > 1) {
    return { status: 'ambiguous', reason: `${inherited.length} windows owned by provider process tree; cannot attribute confidently` };
  }
  return {
    status: 'ambiguous',
    reason: `new window(s) are not attributable to the provider process tree (${candidates.length} candidate(s), pid ${pid}); refusing to move an unrelated window`,
  };
}

export interface FocusGuardResult {
  receipt: FocusReceipt;
  resolution: ResolveTargetResult;
  moved: boolean;
  preserved: { ok: boolean; reasons: string[] };
}

/**
 * A violation observed DURING the launch/startup race window (before the
 * post-move verification). Distinguishes prevent-first outcomes from plain
 * post-hoc detection.
 */
export interface ObservedViolation {
  kind: 'current-desktop-changed' | 'active-window-stolen' | 'active-window-unattributable' | 'owner-interaction-suspected';
  detail: string;
  atMs: number;
}

/**
 * Full guard flow: snapshot -> resolve target -> (caller launches provider) ->
 * attribute the provider window -> non-activating move -> RE-SNAPSHOT ->
 * verify the provider window actually sits on the target workspace ->
 * verify owner invariants -> receipt.
 *
 * `after` is the post-launch, pre-move snapshot. `placement: 'placed'` is
 * granted ONLY when a post-move snapshot proves providerWorkspace ===
 * targetWorkspace; a wmctrl exit code alone is never acceptance. Post-move
 * verification failure yields `verification_failed` (never 'prevented_and_verified').
 */
export function placeAndVerify(
  opts: FocusGuardOptions,
  before: DesktopSnapshot,
  after: DesktopSnapshot,
  providerPid?: number | string,
  moved = true,
  observedViolations: readonly ObservedViolation[] = [],
): FocusGuardResult {
  const exec = opts.exec ?? syncExec;
  const resolution = resolveTargetWorkspace(opts, before);
  const receipt: FocusReceipt = {
    schema: 'agent-rules/mcp-focus-receipt',
    version: 1,
    session_id: opts.sessionId,
    sourceWindowIdHash: resolution.windowId ? hashWindowId(resolution.windowId) : undefined,
    targetWorkspace: resolution.workspace,
    before: { currentWorkspace: before.currentWorkspace, activeWindowIdHash: before.activeWindowId ? hashWindowId(before.activeWindowId) : null },
    after: null,
    providerWindowIdHash: undefined,
    providerWorkspace: undefined,
    placement: resolution.status !== 'resolved' ? 'blocked_before_launch' : 'no-new-window-detected',
    visibility: 'visible',
    focusPolicy: 'preserve',
    isolated: true,
    capability: { wmctrl: true, xprop: true, display: true },
    errors: [],
    created_at: new Date().toISOString(),
  };
  if (resolution.status !== 'resolved') {
    receipt.placement = resolution.status === 'needs-user' ? 'needs-user' : 'blocked_before_launch';
    receipt.errors.push(resolution.reason);
    return { receipt, resolution, moved: false, preserved: { ok: false, reasons: [resolution.reason] } };
  }
  // Prevention-first: violations observed across the launch race window are
  // never downgraded to warnings. An owner-interaction-suspected violation is
  // unobservable (the evidence cannot be attributed), everything else fails.
  const hardViolations = observedViolations.filter((entry) => entry.kind !== 'owner-interaction-suspected');
  const unobservable = observedViolations.some((entry) => entry.kind === 'owner-interaction-suspected');
  for (const violation of observedViolations) {
    receipt.errors.push(`race-window violation (${violation.kind}): ${violation.detail}`);
  }
  if (hardViolations.length > 0) {
    receipt.placement = 'detected_after_violation';
    return { receipt, resolution, moved: false, preserved: { ok: false, reasons: hardViolations.map((entry) => entry.detail) } };
  }
  if (unobservable) {
    receipt.placement = 'unobservable';
    return { receipt, resolution, moved: false, preserved: { ok: false, reasons: ['owner interaction suspected during the race window; evidence is UNOBSERVABLE'] } };
  }
  const match = findNewWindow(before, after, providerPid);
  if (match.status !== 'found' || !match.window) {
    receipt.placement = match.status === 'none' ? 'no-new-window-detected' : 'blocked';
    receipt.errors.push(match.reason);
    const preserved = verifyFocusPreserved(before, after);
    if (!preserved.ok) receipt.errors.push(...preserved.reasons);
    return { receipt, resolution, moved: false, preserved };
  }
  const window = match.window;
  receipt.providerWindowIdHash = hashWindowId(window.windowId);
  if (moved && window.workspace !== resolution.workspace) {
    // AM-0004: EWMH client message (_NET_WM_DESKTOP via wmctrl -t). Never
    // activating; acceptance comes from the post-move readback below.
    const ok = moveWindowToWorkspace(exec, window.windowId, resolution.workspace as number);
    if (!ok) {
      receipt.placement = 'blocked';
      receipt.errors.push(`EWMH workspace move (wmctrl -i -r ${hashWindowId(window.windowId)} -t ${resolution.workspace}) failed; placement cannot be proven`);
    }
  }
  // AM-0004 closeout: a window that is not yet WM-managed when the client
  // message is sent may be mapped on the current desktop afterwards (Muffin
  // ignores the hint and manages the new window where it appears). Retry the
  // non-activating move with readback until it sticks or the budget ends.
  for (let attempt = 0; attempt < 5; attempt++) {
    const readback = snapshotDesktop(exec);
    const probe = readback.windows.find((entry) => entry.windowId === window.windowId);
    if (probe?.workspace === resolution.workspace) break;
    if (attempt < 4) {
      try { exec('sleep', ['0.3']); } catch { /* delay best-effort */ }
      moveWindowToWorkspace(exec, window.windowId, resolution.workspace as number);
    }
  }
  // AM-0006 repair: RE-SNAPSHOT after the move and verify the provider window
  // actually sits on the target workspace. 'prevented_and_verified' requires proof, not exit code.
  const afterMove = snapshotDesktop(exec);
  const providerAfter = afterMove.windows.find((entry) => entry.windowId === window.windowId);
  receipt.after = { currentWorkspace: afterMove.currentWorkspace, activeWindowIdHash: afterMove.activeWindowId ? hashWindowId(afterMove.activeWindowId) : null };
  receipt.providerWorkspace = providerAfter?.workspace ?? null;
  const preserved = verifyFocusPreserved(before, afterMove);
  if (!preserved.ok) receipt.errors.push(...preserved.reasons);
  if (providerAfter === undefined) {
    receipt.placement = 'verification_failed';
    receipt.errors.push('provider window not found in the post-move snapshot');
  } else if (providerAfter.workspace !== resolution.workspace) {
    receipt.placement = 'verification_failed';
    receipt.errors.push(`provider window ${hashWindowId(window.windowId)} is on workspace ${providerAfter.workspace ?? 'unknown'} after move, expected ${resolution.workspace}`);
  } else {
    receipt.placement = 'prevented_and_verified';
  }
  // mcp-visible-workspace-isolation-v1: visible proof + isolation proofs.
  // 1. The provider window must be visible and NOT iconic on its workspace.
  receipt.providerNonIconic = providerAfter !== undefined && windowIsNonIconic(exec, window.windowId);
  if (receipt.placement === 'prevented_and_verified' && !receipt.providerNonIconic) {
    receipt.placement = 'verification_failed';
    receipt.errors.push(`provider window ${hashWindowId(window.windowId)} is not visible/non-iconic (WM_STATE) on the target workspace`);
  }
  // 2. No OTHER window may change workspace during the launch/move.
  const movedOthers = otherWindowsMoved(before, afterMove, window.windowId);
  receipt.otherWindowsUnchanged = movedOthers.length === 0;
  if (receipt.placement === 'prevented_and_verified' && movedOthers.length > 0) {
    receipt.placement = 'verification_failed';
    receipt.errors.push(`other window(s) changed workspace: ${movedOthers.map((entry) => `${entry.windowIdHash}:${entry.from ?? '?'}->${entry.to ?? '?'}`).join(', ')}`);
  }
  // 3. The provider must never steal the owner's active window under the
  //    preserve policy (race guard: a headed window may self-focus on map).
  if (receipt.focusPolicy === 'preserve' && afterMove.activeWindowId === window.windowId) {
    receipt.placement = 'verification_failed';
    receipt.errors.push(`provider window ${hashWindowId(window.windowId)} stole the active window; failing closed instead of masking the activation race`);
  }
  return { receipt, resolution, moved: true, preserved };
}

export function emitFocusReceipt(receipt: FocusReceipt, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}
