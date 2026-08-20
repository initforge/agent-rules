import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import fs from "node:fs/promises";
import path from "node:path";

interface ManifestFile {
  path: string;
  sha256: string;
}

interface Manifest {
  files: ManifestFile[];
}

/**
 * Verify-mirrors: checks that skills/ and rules/ (excluding overlays)
 * are identical across all platform builds.
 * Full native TypeScript implementation.
 */
export async function verifyMirrors(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const root = getRepoRoot();
  const buildRoot = path.join(root, "generated", "runtime-build");
  const platforms = ["codex", "grok", "antigravity", "cursor"];
  const errors: string[] = [];

  if (options.dryRun) {
    console.log("[dry-run] Would verify mirror parity across all platforms");
    return { exitCode: ExitCode.Success, message: "Dry-run: verify skipped" };
  }

  // REQ-011: verify is strictly read-only. A missing build is reported as
  // BLOCKED, never repaired by running a build from within verification.
  try {
    await fs.access(path.join(buildRoot, "codex", "manifest.json"));
  } catch {
    return {
      exitCode: ExitCode.ValidationFailed,
      message: "Mirror verification BLOCKED: build missing at generated/runtime-build (verify is read-only; run `agent-rules build` first)",
    };
  }

  // Load base (codex) manifest
  let baseManifest: Manifest;
  try {
    baseManifest = JSON.parse(
      await fs.readFile(path.join(buildRoot, "codex", "manifest.json"), "utf-8")
    );
  } catch {
    return {
      exitCode: ExitCode.GeneralError,
      message: "Cannot read codex manifest.json",
    };
  }

  const baseFiles = baseManifest.files;

  for (const platform of platforms.slice(1)) {
    let otherManifest: Manifest;
    try {
      otherManifest = JSON.parse(
        await fs.readFile(
          path.join(buildRoot, platform, "manifest.json"),
          "utf-8"
        )
      );
    } catch {
      errors.push(`Cannot read ${platform} manifest.json`);
      continue;
    }

    const otherFiles = otherManifest.files;

    // Check skills/ mirror
    const baseSkills = baseFiles.filter((f) => f.path.startsWith("skills/"));
    for (const item of baseSkills) {
      const match = otherFiles.find((f) => f.path === item.path);
      if (!match) {
        errors.push(`Skill mirror drift: ${platform} missing ${item.path}`);
      } else if (match.sha256 !== item.sha256) {
        errors.push(
          `Skill mirror drift: ${platform} ${item.path} hash mismatch`
        );
      }
    }

    // Check rules/ mirror (excluding overlay files)
    const baseRules = baseFiles.filter(
      (f) => f.path.startsWith("rules/") && !f.path.endsWith("-overlay.md")
    );
    for (const item of baseRules) {
      const match = otherFiles.find((f) => f.path === item.path);
      if (!match) {
        errors.push(`Core mirror drift: ${platform} missing ${item.path}`);
      } else if (match.sha256 !== item.sha256) {
        errors.push(
          `Core mirror drift: ${platform} ${item.path} hash mismatch`
        );
      }
    }
  }

  if (errors.length > 0) {
    return {
      exitCode: ExitCode.ValidationFailed,
      message: `Mirror parity FAILED: ${errors.join("; ")}`,
      data: { errors },
    };
  }

  console.log("Mirror parity PASS");
  return {
    exitCode: ExitCode.Success,
    message: "Mirror parity PASS",
  };
}
