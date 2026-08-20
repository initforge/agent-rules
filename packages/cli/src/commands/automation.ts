import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import { verifyRuntimeState } from "../automation/verify-runtime-state.js";
import { exportRuntimeState } from "../automation/export-runtime-state.js";
import { importReviewedChanges } from "../automation/import-reviewed-changes.js";
import { validateNo5feduLeakage } from "../automation/validate-no-5fedu-leakage.js";
import { regressionHarnessGuards } from "../automation/regression-harness-guards.js";
import { cutoverContextRouting } from "../automation/cutover-context-routing.js";
import { syncProjectAgents } from "../automation/sync-project-agents.js";
import { dockerComposePolicy } from "../automation/docker-compose-policy.js";
import { materializeTemplateSource } from "../automation/materialize-template-source.js";
import { runVitestGoverned } from "../automation/run-vitest-governed.js";
import { validateToolRegistry } from "../automation/validate-tool-registry.js";
import { buildBenchmarkRuntime } from "../automation/build-benchmark-runtime.js";
import { installClaudeAdapter } from "../automation/install-claude-adapter.js";
import { installOpenCodeAdapter } from "../automation/install-opencode-adapter.js";
import { installProfile } from "../automation/install-profile.js";
import { doctorProfile } from "../automation/doctor-profile.js";
import { discoverProfiles } from "../automation/discover-profiles.js";
import { removeProfile } from "../automation/remove-profile.js";
import { updateProfile } from "../automation/update-profile.js";

type AutomationAction =
  | "verify-runtime-state"
  | "export-runtime-state"
  | "validate-leakage"
  | "regression-guards"
  | "cutover-routing"
  | "sync-project-agents"
  | "compose-policy"
  | "materialize-template"
  | "validate-registry"
  | "build-benchmark"
  | "install-claude-adapter"
  | "install-opencode-adapter"
  | "profile-install"
  | "profile-doctor"
  | "profile-discover"
  | "profile-remove"
  | "profile-update";

export async function automationCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const action = args[0] as AutomationAction;

  if (!action) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `Available actions: verify-runtime-state, export-runtime-state, validate-leakage, regression-guards, cutover-routing, sync-project-agents, compose-policy, materialize-template, validate-registry, build-benchmark, install-claude-adapter, install-opencode-adapter, profile-install, profile-doctor, profile-discover, profile-remove, profile-update`,
    };
  }

  const repoRoot = getRepoRoot();

  try {
    switch (action) {
      case "verify-runtime-state": {
        const result = await verifyRuntimeState();
        const allOk = result.every((r) => r.ok);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const r of result) {
            console.log(`${r.ok ? "✓" : "✗"} ${r.platform}: ${r.message}`);
          }
        }
        return { exitCode: allOk ? ExitCode.Success : ExitCode.GeneralError, message: allOk ? "All platforms PASS" : "Some platforms FAILED" };
      }

      case "export-runtime-state": {
        const result = await exportRuntimeState();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const r of result) {
            console.log(`${r.platform}: manifest=${r.manifestExists}, integrations=${r.integrationsStateExists}`);
          }
        }
        return { exitCode: ExitCode.Success, message: "Runtime state exported" };
      }

      case "validate-leakage": {
        const result = await validateNo5feduLeakage(repoRoot);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.ok) {
            console.log("5fedu leakage check PASS");
          } else {
            for (const p of result.problems) {
              console.error(p);
            }
          }
        }
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.ok ? "PASS" : "FAILED" };
      }

      case "regression-guards": {
        const result = await regressionHarnessGuards(repoRoot);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const r of result.results) {
            console.log(r.message);
          }
        }
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.ok ? "PASS" : "FAILED" };
      }

      case "cutover-routing": {
        const result = await cutoverContextRouting(repoRoot);
        console.log(result.message);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "sync-project-agents": {
        const projectRoot = args[1];
        if (!projectRoot) {
          return { exitCode: ExitCode.InvalidArgument, message: "Usage: automation sync-project-agents <project-root> [profile]" };
        }
        const profile = (args[2] as "default" | "tah-app" | "nostime") ?? "default";
        const result = await syncProjectAgents({ projectRoot, profile, repoRoot });
        console.log(result.message);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "compose-policy": {
        const actionType = (args[1] as "check" | "enforce" | "status" | "list-violations" | "selftest") ?? "status";
        const result = await dockerComposePolicy(repoRoot, actionType);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Status: ${result.status}`);
          console.log(`Violations: ${result.violationCount}`);
          console.log(`Services: ${result.serviceCount}`);
        }
        return { exitCode: result.violationCount === 0 ? ExitCode.Success : ExitCode.GeneralError, message: result.status };
      }

      case "materialize-template": {
        const result = await materializeTemplateSource({
          sourceLockPath: args[1],
          projectRoot: args[2],
          repoRoot,
        });
        console.log(result.message);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "validate-registry": {
        const result = await validateToolRegistry(repoRoot);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.ok) {
            console.log("Registry validation PASS");
          } else {
            for (const e of result.errors) {
              console.error(e);
            }
          }
        }
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.ok ? "PASS" : "FAILED" };
      }

      case "build-benchmark": {
        const result = await buildBenchmarkRuntime({ repoRoot });
        console.log(result.message);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "install-claude-adapter": {
        const result = await installClaudeAdapter({ repoRoot, whatIf: options.dryRun });
        console.log(result.message);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "install-opencode-adapter": {
        const isGlobal = args.includes("--global");
        const result = await installOpenCodeAdapter({ repoRoot, global: isGlobal, whatIf: options.dryRun });
        console.log(result.message);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "profile-install": {
        const name = args[1];
        if (!name) {
          return { exitCode: ExitCode.InvalidArgument, message: "Usage: automation profile-install <name>" };
        }
        const result = await installProfile({ name, repoRoot, force: args.includes("--force") });
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "profile-doctor": {
        const name = args[1];
        const result = await doctorProfile(repoRoot, name || undefined);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.ok ? "Profile health OK" : "Profile health FAILED" };
      }

      case "profile-discover": {
        const profiles = await discoverProfiles(repoRoot);
        if (profiles.length === 0) {
          console.log("No profiles available.");
        } else {
          console.log("Available profiles:\n");
          for (const p of profiles) {
            const flag = p.enabledByDefault ? "[default]" : "[optional]";
            console.log(`  ${p.name} ${flag}`);
            if (p.displayName) console.log(`    Name: ${p.displayName}`);
            if (p.version) console.log(`    Version: ${p.version}`);
            if (p.description) console.log(`    ${p.description}`);
            console.log("");
          }
        }
        return { exitCode: ExitCode.Success, message: "Profiles discovered" };
      }

      case "profile-remove": {
        const name = args[1];
        if (!name) {
          return { exitCode: ExitCode.InvalidArgument, message: "Usage: automation profile-remove <name>" };
        }
        const result = await removeProfile({ name, repoRoot, force: args.includes("--force") });
        console.log(result.message);
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      case "profile-update": {
        const name = args[1];
        if (!name) {
          return { exitCode: ExitCode.InvalidArgument, message: "Usage: automation profile-update <name>" };
        }
        const result = await updateProfile({ name, repoRoot, force: args.includes("--force") });
        return { exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError, message: result.message };
      }

      default:
        return { exitCode: ExitCode.InvalidArgument, message: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: (error as Error).message };
  }
}
