import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function skillsDoctor(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const repoRoot = args[0] ?? process.cwd();
  const skillsDir = path.join(repoRoot, "skills");
  const profilesSkillsDir = path.join(repoRoot, "profiles", "5fedu", "skills");

  const findings: Array<{ path: string; hasSKILLMD: boolean; slug: string }> = [];

  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
        findings.push({
          path: `skills/${entry.name}/`,
          hasSKILLMD: fs.existsSync(skillMd),
          slug: entry.name,
        });
      }
    }
  }

  if (fs.existsSync(profilesSkillsDir)) {
    for (const entry of fs.readdirSync(profilesSkillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const skillMd = path.join(profilesSkillsDir, entry.name, "SKILL.md");
        findings.push({
          path: `profiles/5fedu/skills/${entry.name}/`,
          hasSKILLMD: fs.existsSync(skillMd),
          slug: entry.name,
        });
      }
    }
  }

  const missingMd = findings.filter((f) => !f.hasSKILLMD);
  return {
    exitCode: missingMd.length > 0 ? ExitCode.GeneralError : ExitCode.Success,
    message:
      missingMd.length > 0
        ? `Skills doctor: ${missingMd.length} skill(s) missing SKILL.md`
        : `Skills doctor: all ${findings.length} skill(s) ok`,
    data: { total: findings.length, ok: findings.length - missingMd.length, missing: missingMd.map((f) => f.path) },
  };
}

export async function skillsCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case "doctor":
      return skillsDoctor(args.slice(1), opts);
    case "resolve": {
      const catalogPath = path.join(process.cwd(), "skills", "candidate-fabric.json");
      try {
        const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as Record<string, unknown>;
        return {
          exitCode: ExitCode.Success,
          message: "External skill candidates resolved (reference/on-demand only; nothing installed)",
          data: { candidates: catalog.external_source_matrix ?? [], installed: false, activation: "explicit-only" },
        };
      } catch (error) {
        return { exitCode: ExitCode.GeneralError, message: `Unable to read candidate fabric: ${(error as Error).message}` };
      }
    }
    case "search":
    case "preview":
    case "install":
    case "update": {
      // This is deliberately a thin, explicit binding to the official GitHub
      // CLI surface. agent-rules does not implement a second skill manager.
      try {
        const result = await execFileAsync("gh", ["skill", subcommand, ...args.slice(1)], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 });
        return {
          exitCode: ExitCode.Success,
          message: `gh skill ${subcommand} completed${subcommand === "install" ? " (explicit request only)" : ""}`,
          data: { stdout: result.stdout, stderr: result.stderr, provider: "gh skill", activation: subcommand === "install" ? "explicit-only" : "read-only" },
        };
      } catch (error) {
        const detail = error as { message?: string; stderr?: string };
        return {
          exitCode: ExitCode.GeneralError,
          message: `gh skill ${subcommand} unavailable or failed: ${detail.stderr || detail.message || String(error)}`,
          data: { provider: "gh skill", status: "BLOCKED", fallback: "no-skill or existing local route", activation: "none" },
        };
      }
    }
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown skills subcommand: ${subcommand}. Available: doctor, resolve, search, preview, install, update`,
      };
  }
}
