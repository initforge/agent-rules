import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/powershell.js";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import * as crypto from "node:crypto";
import path from "node:path";
import { buildContextGraph, validateGraph } from "../services/context-graph.js";

async function detectPython(root: string): Promise<string | null> {
  const candidates = ["python", "python3"];
  for (const c of candidates) {
    try {
      await fs.access(path.join(root, c));
      return c;
    } catch {
      try {
        await new Promise<void>((resolve, reject) => {
          const child = execFile(c, ["--version"], { timeout: 5_000 }, (err) => {
            err ? reject(err) : resolve();
          });
          child.on("error", reject);
        });
        return c;
      } catch { /* try next */ }
    }
  }
  return null;
}

async function runPython(scriptPath: string, args: string[], root: string): Promise<{ ok: boolean; skipped: boolean; output: string }> {
  const python = await detectPython(root);
  if (!python) return { ok: true, skipped: true, output: "[SKIP] Python not available" };
  return new Promise((resolve) => {
    const child = execFile(
      python, [scriptPath, ...args],
      { cwd: root, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, skipped: false, output: stdout + (stderr ? `\n${stderr}` : "") });
      }
    );
  });
}

async function runPowershell(scriptPath: string, args: string[], root: string): Promise<{ ok: boolean; output: string }> {
  const shell = process.platform === "win32" ? "powershell" : "pwsh";
  return new Promise((resolve) => {
    const child = execFile(
      shell,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
      { cwd: root, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: stdout + (stderr ? `\n${stderr}` : "") });
      }
    );
  });
}

async function checkFile(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function estimateTokens(text: string): Promise<number> {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Math.ceil(normalized.length / 3.6);
}

export async function validate(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const root = getRepoRoot();
  const errors: string[] = [];
  const output: string[] = [];
  const automationDir = path.join(root, "automation");

  if (options.dryRun) {
    console.log("[dry-run] Would run all validation checks");
    return { exitCode: ExitCode.Success, message: "Dry-run: validate skipped" };
  }

  // 1. Native agent policy test (Python)
  const nativeTest = path.join(automationDir, "test-native-agent-policy.py");
  if (await checkFile(nativeTest)) {
    const r = await runPython(nativeTest, [], root);
    if (!r.ok && !r.skipped) errors.push("Native agent/model policy contract failed");
    if (r.skipped && options.verbose) output.push(r.output);
    else if (options.verbose) output.push(r.output);
  } else {
    errors.push("Missing native agent policy test");
  }

  // 2. Core token budget check
  const manifestPath = path.join(root, "rules", "manifest.yaml");
  if (await checkFile(manifestPath)) {
    const content = await fs.readFile(manifestPath, "utf-8");
    const budgetMatch = content.match(/core_total_tokens:\s*(\d+)/);
    const coreBudget = budgetMatch ? parseInt(budgetMatch[1], 10) : 4000;

    // Parse manifest load_order
    const loadMatch = content.match(/load_order:\s*\r?\n((?:[ \t]+-\s+\S+\r?\n)+)/);
    const loadOrderFiles: string[] = [];
    if (loadMatch) {
      for (const line of loadMatch[1].split("\n")) {
        const m = line.match(/-\s*(\S+)/);
        if (m) loadOrderFiles.push(m[1]);
      }
    }

    if (loadOrderFiles.length < 7) {
      errors.push(`Manifest load_order parse incomplete: only ${loadOrderFiles.length} rule(s)`);
    }

    let coreChars = 0;
    for (const ruleFile of loadOrderFiles) {
      const rp = path.join(root, "rules", ruleFile);
      try {
        const text = await fs.readFile(rp, "utf-8");
        coreChars += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").length;
      } catch { /* skip missing */ }
    }
    const actualTokens = Math.ceil(coreChars / 3.6);
    if (actualTokens > coreBudget) {
      errors.push(`Core token budget exceeded: ${actualTokens} > ${coreBudget}`);
    }
    if (options.verbose) {
      output.push(`Core tokens (estimated): ${actualTokens}`);
    }
  }

  // 3. Platform overlay budget checks
  for (const platform of ["codex", "grok", "antigravity", "cursor"]) {
    const overlay = path.join(root, "platforms", platform, `${platform}-overlay.md`);
    if (await checkFile(overlay)) {
      const text = await fs.readFile(overlay, "utf-8");
      const tokens = await estimateTokens(text);
      if (tokens > 600) {
        errors.push(`${platform} overlay budget exceeded: ${tokens}`);
      }
    } else {
      errors.push(`Missing overlay: ${platform}`);
    }
  }

  // 4. Skill BOM / budget checks
  const skillsDir = path.join(root, "skills");
  const intentionalOversize = ["docs-style", "plan-and-handoff", "finish-to-completion", "code-review"];
  const slugs: string[] = [];
  try {
    const skillDirs = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const d of skillDirs) {
      if (!d.isDirectory()) continue;
      const skillPath = path.join(skillsDir, d.name, "SKILL.md");
      if (!(await checkFile(skillPath))) continue;
      slugs.push(d.name);

      const raw = await fs.readFile(skillPath);
      if (raw.length >= 3 && raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
        errors.push(`UTF-8 BOM forbidden in skill frontmatter: ${skillPath}`);
      }

      const text = raw.toString("utf-8");
      const tokens = await estimateTokens(text);
      if (tokens > 3500 && !intentionalOversize.includes(d.name)) {
        errors.push(`Skill token budget exceeded: ${skillPath} = ${tokens}`);
      } else if (tokens > 3500 && options.verbose) {
        output.push(`Intentional oversize skill (allowed): ${d.name} ~${tokens} tokens`);
      }
    }
  } catch { errors.push("Cannot read skills directory"); }

  // Duplicate slugs
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  for (const d of [...new Set(dupes)]) {
    errors.push(`Duplicate skill slug: ${d}`);
  }

  // 5. Required paths
  const required = [
    "docs/guides/00-system-map.md", "docs/guides/05-maturity.md", "integrations/registry.json",
    "profiles/5fedu/projects/AGENTS.md", "profiles/5fedu/projects/00-context-map.md", "profiles/5fedu/projects/decisions.md",
    "rules/05-critical-thinking.md", "rules/16-context-style.md", "rules/25-task-lifecycle.md",
    "skills/plan-and-handoff/SKILL.md",
    "skills/plan-and-handoff/references/adaptive-work-protocol.md",
    "skills/plan-and-handoff/references/plan-artifact-template.md",
    "skills/plan-and-handoff/references/capability-tier-routing.md",
    "skills/finish-to-completion/references/slice-gate-protocol.md",
    "automation/workctl.py", "automation/work-ledger.schema.json",
    "automation/test-workctl.py",
    "profiles/5fedu/projects/domains/references/pattern-inventory.yaml",
  ];
  for (const rp of required) {
    if (!(await checkFile(path.join(root, ...rp.split("/"))))) {
      errors.push(`Missing required path: ${rp}`);
    }
  }

  // 6. Codex AGENTS template markers
  const codexAgents = path.join(root, "platforms", "codex", "AGENTS.md");
  if (await checkFile(codexAgents)) {
    const body = await fs.readFile(codexAgents, "utf-8");
    if (!body.includes("@__GENERATED_CORE_IMPORTS__")) {
      errors.push("Codex AGENTS template missing generated core import marker");
    }
  }

  // 7. Legacy top-level forbidden paths
  const forbidden = [
    "00-huong-dan", "00-guides", "01-global", "02-du-an", "02-projects",
    "03-nen-tang", "03-platforms", "04-tu-dong-hoa", "04-automation",
    "06-ke-hoach", "06-plans", "05-ban-dung", "knowledge", "build",
  ];
  for (const f of forbidden) {
    if (await checkFile(path.join(root, f))) {
      errors.push(`Legacy top-level folder still exists: ${f}`);
    }
  }

  // 8. Trigger audit check
  const triggerPath = path.join(automationDir, "trigger-audit.json");
  if (await checkFile(triggerPath)) {
    const cases = JSON.parse(await fs.readFile(triggerPath, "utf-8"));
    for (const c of cases) {
      let targetPath = "";
      if (c.skill) {
        targetPath = path.join(root, "skills", c.skill, "SKILL.md");
        if (!(await checkFile(targetPath))) {
          // Fallback: search profile skills
          const profilesDir = path.join(root, "profiles");
          try {
            const profileDirs = await fs.readdir(profilesDir, { withFileTypes: true });
            for (const pd of profileDirs) {
              if (!pd.isDirectory() || pd.name.startsWith(".")) continue;
              const profileSkillPath = path.join(profilesDir, pd.name, "skills", c.skill, "SKILL.md");
              if (await checkFile(profileSkillPath)) {
                targetPath = profileSkillPath;
                break;
              }
            }
          } catch { /* profiles dir may not exist */ }
        }
      } else if (c.file) {
        targetPath = path.join(root, ...c.file.replace(/\\/g, "/").split("/"));
      }

      if (!targetPath || !(await checkFile(targetPath))) {
        errors.push(`Trigger audit target missing for '${c.phrase}': ${targetPath}`);
        continue;
      }
      const body = (await fs.readFile(targetPath, "utf-8")).toLowerCase();
      for (const kw of c.keywords) {
        if (!body.includes(kw.toLowerCase())) {
          errors.push(`Trigger audit recall fail '${c.phrase}': keyword '${kw}' not found`);
          break;
        }
      }
    }
  } else {
    errors.push("Missing trigger audit file: automation/trigger-audit.json");
  }

  // 9. UI routing audit
  const uiAudit = path.join(automationDir, "audit-ui-routing.ps1");
  if (await checkFile(uiAudit)) {
    const r = await runPowershell(uiAudit, ["-Root", root, "-RunId", "validate-context"], root);
    if (!r.ok) errors.push("UI routing audit failed");
  } else {
    errors.push("Missing UI routing audit");
  }

  // 10. Plan artifact audit
  const planAudit = path.join(automationDir, "audit-plan-artifact.ps1");
  if (await checkFile(planAudit)) {
    const r = await runPowershell(planAudit, ["-Root", root], root);
    if (!r.ok) errors.push("Plan artifact audit failed");
  } else {
    errors.push("Missing plan artifact audit");
  }

  // 11. Python contract tests
  const pyTests = ["test-workctl.py", "test-skill-gate-stack.py", "test-external-receipt.py"];
  for (const t of pyTests) {
    const tp = path.join(automationDir, t);
    if (await checkFile(tp)) {
      const r = await runPython(tp, [], root);
      if (!r.ok && !r.skipped) errors.push(`Workflow fixture failed: ${t}`);
      if (r.skipped && options.verbose) output.push(`[SKIP] ${t}: Python not available`);
    } else {
      errors.push(`Missing Python test: ${t}`);
    }
  }

  // 12. Workflow clarity audit (PowerShell, advisory)
  const wfAudit = path.join(automationDir, "audit-workflow-clarity.ps1");
  if (await checkFile(wfAudit)) {
    const r = await runPowershell(wfAudit, ["-Root", root], root);
    if (!r.ok) output.push("[WARN] Workflow clarity audit failed (advisory)");
  } else {
    output.push("[WARN] Missing workflow clarity audit (advisory)");
  }

  // 13. Tool registry validation (PowerShell, advisory)
  const trAudit = path.join(automationDir, "validate-tool-registry.ps1");
  if (await checkFile(trAudit)) {
    const r = await runPowershell(trAudit, ["-Root", root], root);
    if (!r.ok) output.push("[WARN] Tool registry validation failed (advisory)");
  } else {
    output.push("[WARN] Missing tool registry validator (advisory)");
  }

  // 14. 5fedu template purity
  const purityAudit = path.join(root, "profiles", "5fedu", "automation", "audit-5fedu-template-purity.ps1");
  if (await checkFile(purityAudit)) {
    const r = await runPowershell(purityAudit, [], root);
    if (!r.ok) errors.push("5fedu template purity audit failed");
  } else {
    errors.push("Missing 5fedu template purity audit");
  }

  // 15. Context graph validation
  try {
    const graph = buildContextGraph(root);
    const validation = validateGraph(graph);
    if (!validation.valid) {
      for (const err of validation.errors) {
        errors.push(`Context graph: ${err}`);
      }
    }
    if (options.verbose) {
      const s = validation.stats;
      output.push(`Graph: ${s.totalNodes} nodes, ${s.totalTokens} tokens, ${s.sourceCount} sources, ${s.missingSources} missing, ${JSON.stringify(s.nodesByLayer)}`);
    }
  } catch (e) {
    errors.push(`Context graph rebuild failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 16. Route conformance (Python)
  const routerTest = path.join(automationDir, "test-context-router.py");
  if (await checkFile(routerTest)) {
    const r = await runPython(routerTest, [], root);
    if (!r.ok && !r.skipped) errors.push("Graph routing conformance failed");
  }

  // 17. Benchmark contracts (Python)
  const bmTest = path.join(automationDir, "test-agent-quality-benchmark.py");
  if (await checkFile(bmTest)) {
    const r = await runPython(bmTest, ["--contracts-only"], root);
    if (!r.ok && !r.skipped) errors.push("Agent quality benchmark contracts failed");
  }

  // 18. Live adapter contracts (Python)
  const laTest = path.join(automationDir, "test-live-agent-adapter.py");
  if (await checkFile(laTest)) {
    const r = await runPython(laTest, ["--contracts-only"], root);
    if (!r.ok && !r.skipped) errors.push("Live-agent adapter contracts failed");
  }

  // Print output if verbose
  if (options.verbose) {
    for (const line of output) console.log(line);
  }

  const success = errors.length === 0;
  if (success) {
    console.log("Context validation PASS");
  }

  return {
    exitCode: success ? ExitCode.Success : ExitCode.ValidationFailed,
    message: success ? "All validations passed" : errors.join("; "),
    data: success ? undefined : { errors },
  };
}
