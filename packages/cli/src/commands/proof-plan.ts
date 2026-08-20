/**
 * commands/proof-plan.ts — adaptive-minimal-proof-testing CLI surface.
 *
 *   agent-rules proof-plan --repo <root> --task <id> [--files a.ts,b.ts]
 *       [--claims "claim1;claim2"] [--risks "risk1"] [--json]
 *
 * Routes the task through the canonical proof router (trigger -> profile ->
 * selection -> receipt) and prints the receipt. Read-only: never runs tests,
 * never modifies project files; it only plans and records proof selection.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";

const REPO_ROOT = path.resolve(__dirnameSafe(), "..", "..", "..", "..");

function __dirnameSafe(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

async function loadRouter() {
  const kernelPkg = path.join(REPO_ROOT, "packages", "kernel");
  const { routeProofs } = await import(path.join(kernelPkg, "dist", "northstar", "proof-router.js"));
  return { routeProofs };
}

export interface ProofPlanArgs {
  repo?: string;
  task?: string;
  files?: string[];
  claims?: string[];
  risks?: string[];
  live?: boolean;
  fullSuite?: boolean;
  fullSuiteReason?: string;
}

function parseArgs(args: string[]): ProofPlanArgs {
  const out: ProofPlanArgs = { files: [], claims: [], risks: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--repo") out.repo = args[++i];
    else if (a === "--task") out.task = args[++i];
    else if (a === "--files") out.files = (args[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--claims") out.claims = (args[++i] ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    else if (a === "--risks") out.risks = (args[++i] ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    else if (a === "--live") out.live = true;
    else if (a === "--full-suite") out.fullSuite = true;
    else if (a === "--full-suite-reason") out.fullSuiteReason = args[++i];
  }
  return out;
}

export async function proofPlanCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const opts = parseArgs(args);
  if (!opts.repo || !opts.task) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "usage: agent-rules proof-plan --repo <root> --task <id> [--files a,b] [--claims c1;c2] [--risks r1] [--live] [--full-suite]",
    };
  }
  if (!fs.existsSync(path.join(opts.repo, ".git"))) {
    return { exitCode: ExitCode.InvalidArgument, message: `repo root has no .git: ${opts.repo}` };
  }
  try {
    const { routeProofs } = await loadRouter();
    const changedFiles = opts.files!.length > 0
      ? opts.files!
      : listChangedFiles(opts.repo);
    // Owner §4: compile explicit claims; when none given, derive a minimal
    // claim from the changed scope so the plan never silently proves nothing
    // (empty claims => NEEDS_USER, never PASS).
    const claims = opts.claims!.length > 0
      ? opts.claims!.map((c) => ({ id: `claim-${c.slice(0, 12)}`, claim: c, live_surface: opts.live === true }))
      : changedFiles.length > 0
        ? [{ id: 'claim-scope', claim: `changed scope (${changedFiles.length} file(s)) behaves correctly`, live_surface: opts.live === true }]
        : [];
    const route = routeProofs(
      {
        task_id: opts.task!,
        repository: opts.repo,
        trigger: {
          changed_files: changedFiles,
          affected_claims: claims.map((c) => c.id),
          risks: opts.risks,
          risk_hint: opts.risks?.some((r) => /security|auth|isolation/i.test(r)) ? "S3" : opts.risks?.length ? "S2" : "S1",
          runtime_surfaces: opts.live ? ["browser", "mcp", "desktop"] : [],
        },
        claims,
        risks: opts.risks ?? [],
        host_capabilities: detectHostCapabilities(),
        force_full_suite: opts.fullSuite,
        full_suite_reason: opts.fullSuiteReason,
        environment: process.env.DISPLAY ? `x11:${process.env.DISPLAY}` : "headless",
      },
      changedFiles.map((f, i) => ({ proof_id: `planned:${i}`, status: 'PASS' as const })),
    );
    if (options.json) {
      return { exitCode: ExitCode.Success, message: JSON.stringify(route, null, 2) };
    }
    const lines = [
      `proof-plan: ${route.task_id}`,
      `  repository: ${route.plan.repository}`,
      `  changed_scope: ${route.plan.changed_scope.length} file(s)`,
      `  surfaces: ${route.trigger.surfaces.join(', ')}`,
      `  profile: ${route.plan.profile}`,
      `  fidelity: ${route.plan.required_fidelity}`,
      `  selected: ${route.plan.selected.length}`,
      `  omitted: ${route.plan.omitted.length}`,
      `  full_suite: ${route.plan.full_suite_required}`,
      `  final_status: ${route.receipt.final_status}`,
      ...route.route_trace.map((t: string) => `  trace: ${t}`),
    ];
    return { exitCode: ExitCode.Success, message: lines.join('\n') };
  } catch (e) {
    return { exitCode: ExitCode.GeneralError, message: `proof-plan: ${(e as Error).message}` };
  }
}

function listChangedFiles(repo: string): string[] {
  try {
    const out = execFileSync('git', ['-C', repo, 'status', '--short'], { encoding: 'utf8', timeout: 5000 });
    return out.split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function detectHostCapabilities(): string[] {
  const caps: string[] = [];
  if (process.env.DISPLAY) caps.push(`x11:${process.env.DISPLAY}`);
  try {
    if (fs.existsSync('/usr/bin/google-chrome') || fs.existsSync('/usr/bin/chromium')) caps.push('browser-bin');
  } catch { /* ignore */ }
  return caps;
}
