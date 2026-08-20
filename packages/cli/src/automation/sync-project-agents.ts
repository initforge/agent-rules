import fs from "node:fs/promises";
import path from "node:path";

interface SyncProjectAgentsOptions {
  projectRoot: string;
  profile?: "default" | "tah-app" | "nostime";
  whatIf?: boolean;
  repoRoot: string;
}

interface ProfileConfig {
  rootAgents?: {
    title?: string;
    deployNote?: string;
    productionVerifyUrl?: string;
  };
}

const MIGRATE_MARKER = "## Migrated from root AGENTS";

export async function syncProjectAgents(options: SyncProjectAgentsOptions): Promise<{ ok: boolean; message: string }> {
  const { projectRoot, profile = "default", whatIf = false, repoRoot } = options;
  const project = path.resolve(projectRoot);
  const contextDir = path.join(project, "context/5fedu");
  const rootAgents = path.join(project, "AGENTS.md");
  const projectLocalDir = path.join(contextDir, "project-local");
  const hardRules = path.join(projectLocalDir, "agents-hard-rules.md");
  const mapPath = path.join(repoRoot, "automation/legacy-context-path-map.json");
  const templatePath = path.join(repoRoot, "projects/context-template/root-AGENTS.md");

  // Load profile config
  let profileConfig: ProfileConfig | null = null;
  if (profile !== "default") {
    const profilePath = path.join(repoRoot, `profiles/5fedu/automation/profiles/${profile}.json`);
    try {
      profileConfig = JSON.parse(await fs.readFile(profilePath, "utf8"));
    } catch {
      // Profile not found, use defaults
    }
  }

  const title = profileConfig?.rootAgents?.title ?? "5fedu Project Entry";
  const deployNote = profileConfig?.rootAgents?.deployNote ?? "";
  const productionUrl = profileConfig?.rootAgents?.productionVerifyUrl ?? "";

  // Check if context/5fedu exists
  if (!(await dirExists(contextDir))) {
    return { ok: true, message: "No context/5fedu - skip root AGENTS sync" };
  }

  await fs.mkdir(projectLocalDir, { recursive: true });

  // Load path map
  const pathMap: Record<string, string> = {};
  try {
    const rawMap = JSON.parse(await fs.readFile(mapPath, "utf8"));
    for (const [key, value] of Object.entries(rawMap)) {
      pathMap[key] = String(value);
    }
  } catch {
    // No path map, use empty
  }

  let existingRoot = "";
  try {
    existingRoot = await fs.readFile(rootAgents, "utf8");
  } catch {
    // No existing root AGENTS.md
  }

  const hasLegacy = testLegacyAgentsContent(existingRoot);
  let hardRulesBody = "";
  let hardRulesExists = false;
  try {
    hardRulesBody = await fs.readFile(hardRules, "utf8");
    hardRulesExists = true;
  } catch {
    // No hard rules file
  }
  const alreadyMigrated = hardRulesBody.includes(MIGRATE_MARKER);

  if (hasLegacy && (!alreadyMigrated || !hardRulesExists)) {
    const extracted = getExtractedHardRules(existingRoot, pathMap);
    if (extracted) {
      const hardRulesText = `# Repo-specific hard rules\n\n${MIGRATE_MARKER} (${new Date().toISOString().split("T")[0]}).\n\n${extracted}\n`;
      if (whatIf) {
        console.log(`[WhatIf] Would write: ${hardRules}`);
      } else {
        await fs.writeFile(hardRules, hardRulesText.trimEnd() + "\n", "utf8");
        console.log(`Extracted hard rules -> ${hardRules}`);
      }
    }
  }

  if (hardRulesExists) {
    const rewritten = rewriteLegacyPaths(hardRulesBody, pathMap);
    if (rewritten !== hardRulesBody) {
      if (whatIf) {
        console.log(`[WhatIf] Would refresh legacy paths in ${hardRules}`);
      } else {
        await fs.writeFile(hardRules, rewritten.trimEnd() + "\n", "utf8");
        console.log(`Refreshed legacy paths in ${hardRules}`);
      }
    }
  }

  const newRoot = await newRootAgentsContent(templatePath, title, deployNote, productionUrl);
  if (whatIf) {
    console.log(`[WhatIf] Would write root AGENTS.md:\n${newRoot}`);
  } else {
    await fs.writeFile(rootAgents, newRoot, "utf8");
    console.log(`Updated root AGENTS.md -> ${rootAgents}`);
  }

  return { ok: true, message: "Project agents synced" };
}

function testLegacyAgentsContent(body: string): boolean {
  if (!body) return false;
  const legacyNeedles = [
    "03-database-supabase.md",
    "04-auth-permissions-and-flows.md",
    "05-delivery-quality.md",
    "07-working-format.md",
    "context/5fedu/00-index.md",
    "04-decision-status-and-backlog.md",
    "06-decision-status.md",
    "11-current-sheets-source-map.md",
    "01-tech-stack-and-template.md",
    "02-frontend-mapping.md",
  ];
  return legacyNeedles.some((needle) => body.includes(needle));
}

function rewriteLegacyPaths(text: string, map: Record<string, string>): string {
  let out = text;
  const bq = "\u0060";
  for (const [key, value] of Object.entries(map)) {
    out = out.replaceAll(`context/5fedu/${key}`, `context/5fedu/${value}`);
    out = out.replaceAll(`${bq}context/5fedu/${key}${bq}`, `${bq}context/5fedu/${value}${bq}`);
    out = out.replaceAll(`${bq}${key}${bq}`, `${bq}${value}${bq}`);
  }
  out = out.replaceAll(`${bq}00-index.md${bq}`, `${bq}00-context-map.md${bq}`);
  out = out.replaceAll("00-index.md", "00-context-map.md");
  while (out.includes("open-open-")) {
    out = out.replaceAll("open-open-", "open-");
  }
  out = out.replace(/(?<!open-)(?<![\w/])questions\.md/g, "open-questions.md");
  out = out.replaceAll("06-decision-status.md", "decisions.md");
  const legacyTargets: Record<string, string> = {
    "legacy/working-format-legacy.md": "profiles/5fedu/domains/references/ui-delivery-detail.md",
    "legacy/delivery-quality-legacy.md": "profiles/5fedu/domains/ui-delivery.md",
    "legacy/database-supabase-legacy.md": "profiles/5fedu/domains/database.md",
    "legacy/auth-permissions-legacy.md": "profiles/5fedu/domains/permissions.md",
    "legacy/decision-status-legacy.md": "decisions.md",
  };
  for (const [legacy, target] of Object.entries(legacyTargets)) {
    out = out.replaceAll(legacy, target);
    out = out.replaceAll(`${bq}${legacy}${bq}`, `${bq}${target}${bq}`);
  }
  return out;
}

function getExtractedHardRules(body: string, map: Record<string, string>): string {
  const lines = body.split("\n");
  const capture: string[] = [];
  let inSkipSection = false;
  for (const line of lines) {
    if (/^##\s+(Luôn đọc trước khi làm|Chỉ đọc khi liên quan)\s*$/.test(line)) {
      inSkipSection = true;
      continue;
    }
    if (inSkipSection && /^##\s+/.test(line)) {
      inSkipSection = false;
    }
    if (inSkipSection) continue;
    if (/^#\s+5fedu Project Entry\s*$/.test(line) && capture.length === 0) continue;
    if (/^\*\*Context:\*\*/.test(line)) continue;
    if (/^---\s*$/.test(line) && capture.length === 0) continue;
    if (line.trim().length === 0 && capture.length === 0) continue;
    capture.push(line);
  }
  const extracted = capture.join("\n").trim();
  if (extracted.length < 40) return "";
  return rewriteLegacyPaths(extracted, map);
}

async function newRootAgentsContent(templatePath: string, title: string, deployNote: string, productionUrl: string): Promise<string> {
  try {
    const template = await fs.readFile(templatePath, "utf8");
    const deployLine = deployNote || "";
    const prodLine = productionUrl ? `Production verify: ${productionUrl} (when applicable)` : "";
    let content = template.replace(/\{\{TITLE\}\}/g, title);
    content = content.replace(/\{\{DEPLOY_NOTE\}\}/g, deployLine);
    content = content.replace(/\{\{PRODUCTION_VERIFY\}\}/g, prodLine);
    return content.trimEnd() + "\n";
  } catch {
    throw new Error(`Missing template: ${templatePath}`);
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
