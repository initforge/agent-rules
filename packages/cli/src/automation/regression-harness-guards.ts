import fs from "node:fs/promises";
import path from "node:path";

interface GuardResult {
  ok: boolean;
  message: string;
}

export async function regressionHarnessGuards(repoRoot: string): Promise<{ ok: boolean; results: GuardResult[] }> {
  const results: GuardResult[] = [];
  const assert = (condition: boolean, message: string) => {
    results.push({ ok: condition, message: condition ? `OK: ${message}` : `FAIL: ${message}` });
  };

  // 1) docs-style BOM check
  const docsSkill = path.join(repoRoot, "skills/docs-style/SKILL.md");
  try {
    const bytes = await fs.readFile(docsSkill);
    const noBom = !(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
    assert(noBom, "docs-style SKILL.md has no UTF-8 BOM");
  } catch {
    assert(false, "docs-style SKILL.md not found");
  }

  // 2) No legacy dual-tree filenames in rules/
  const legacyFiles = ["00-index.md", "01-agent-workflow-sop.md", "07-finish-to-completion.md"];
  for (const file of legacyFiles) {
    const exists = await pathExists(path.join(repoRoot, `rules/${file}`));
    assert(!exists, `no legacy ${file} in rules/`);
  }

  // 3) Intentional oversize documented in budget rule
  try {
    const budget = await fs.readFile(path.join(repoRoot, "rules/50-context-budget.md"), "utf8");
    assert(
      budget.includes("docs-style") && budget.includes("plan-and-handoff") && budget.includes("Intentional oversize"),
      "intentional oversize documented"
    );
  } catch {
    assert(false, "50-context-budget.md not found");
  }

  // 4) No deprecated lifecycle labels
  const rulesDir = path.join(repoRoot, "rules");
  const skillsDir = path.join(repoRoot, "skills");
  let foundDeprecated = false;
  for (const dir of [rulesDir, skillsDir]) {
    if (await dirExists(dir)) {
      const files = await listMarkdownFiles(dir);
      for (const file of files) {
        const content = await fs.readFile(file, "utf8");
        if (content.match(/\*\*Lane\s+`[nN]ormal`\*\*/) || content.match(/\*\*Lane\s+`[hH]igh-risk`\*\*/)) {
          foundDeprecated = true;
          assert(false, `Deprecated lifecycle label found in ${path.relative(repoRoot, file)}`);
        }
      }
    }
  }
  if (!foundDeprecated) {
    assert(true, "No deprecated lifecycle labels");
  }

  // 5) No duplicate integrations/ directories by name normalization
  const integrationsDir = path.join(repoRoot, "integrations");
  if (await dirExists(integrationsDir)) {
    const entries = await fs.readdir(integrationsDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    const normalized = new Map<string, string>();
    let hasDuplicate = false;
    for (const dir of dirs) {
      const norm = dir.name.replace(/[_-]/g, "-");
      if (normalized.has(norm)) {
        hasDuplicate = true;
        assert(false, `Duplicate integrations/ directory name '${dir.name}' (conflicts with '${normalized.get(norm)}')`);
      } else {
        normalized.set(norm, dir.name);
      }
    }
    if (!hasDuplicate) {
      assert(true, "No duplicate integrations/ directories");
    }
  }

  // 6) No stale codebase_memory underscore directory
  const staleDir = await pathExists(path.join(repoRoot, "integrations/codebase_memory"));
  assert(!staleDir, "stale integrations/codebase_memory/ directory removed");

  // 7) No stale runtime.yaml references in root READMEs
  for (const readme of ["README.md", "README-vi.md"]) {
    try {
      const content = await fs.readFile(path.join(repoRoot, readme), "utf8");
      assert(!content.includes("runtime.yaml"), `${readme} has no runtime.yaml reference`);
    } catch {
      assert(false, `${readme} not found`);
    }
  }

  // 8) Budget key names
  try {
    const routeCases = JSON.parse(await fs.readFile(path.join(repoRoot, "automation/context-route-cases.json"), "utf8"));
    const budgetKeys = Object.keys(routeCases.budgets ?? {});
    assert(!budgetKeys.includes("core_tokens"), "context-route-cases.json budget key 'core_tokens' removed");
    assert(budgetKeys.includes("core_routing_tokens"), "context-route-cases.json budget key 'core_routing_tokens' present");
  } catch {
    assert(false, "context-route-cases.json not found or invalid");
  }

  // 9) Grok overlay documents inject path
  try {
    const grokOv = await fs.readFile(path.join(repoRoot, "platforms/grok/grok-overlay.md"), "utf8");
    assert(grokOv.includes(".grok/rules") || grokOv.includes(".grok\\rules"), "grok-overlay documents inject path");
  } catch {
    assert(false, "grok-overlay.md not found");
  }

  // 10) No stale "zero main-agent domain work" pattern
  const stalePatternFiles = [
    "rules/25-task-lifecycle.md",
    "skills/plan-and-handoff/references/adaptive-work-protocol.md",
    "skills/finish-to-completion/SKILL.md",
  ];
  for (const file of stalePatternFiles) {
    try {
      const content = await fs.readFile(path.join(repoRoot, file), "utf8");
      assert(!content.includes("zero main-agent domain work"), `${file}: no 'zero main-agent domain work'`);
    } catch {
      assert(false, `${file} not found`);
    }
  }

  // 11) Required role definitions in lifecycle rule
  try {
    const lifecycle = await fs.readFile(path.join(repoRoot, "rules/25-task-lifecycle.md"), "utf8");
    assert(lifecycle.includes("Coordinator"), "25-task-lifecycle.md: defines Coordinator role");
    assert(lifecycle.includes("Architect/integrator"), "25-task-lifecycle.md: defines Architect/integrator role");
    assert(lifecycle.includes("Implementer"), "25-task-lifecycle.md: defines Implementer role");
    assert(lifecycle.includes("Reviewer"), "25-task-lifecycle.md: defines Reviewer role");
    assert(lifecycle.includes("Verifier"), "25-task-lifecycle.md: defines Verifier role");
    assert(lifecycle.includes("delegated"), "25-task-lifecycle.md: records what was delegated");
    assert(lifecycle.includes("outcome"), "25-task-lifecycle.md: records the delegation outcome");
  } catch {
    assert(false, "25-task-lifecycle.md not found");
  }

  const failed = results.filter((r) => !r.ok).length;
  return { ok: failed === 0, results };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listMarkdownFiles(full)));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}
