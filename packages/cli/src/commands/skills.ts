import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import fs from "node:fs";
import path from "node:path";

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
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown skills subcommand: ${subcommand}. Available: doctor`,
      };
  }
}
