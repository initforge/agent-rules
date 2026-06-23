const fs = require('fs');
const path = require('path');

const PROJECTS_DIR = process.env.PROJECTS_DIR || '/home/linhnxdeveloper/Projects';
const REPO_ROOT = path.join(__dirname, '..');
const MASTER_AGENTS_DIR = path.join(REPO_ROOT, 'platforms', 'antigravity', '.agents');
const MASTER_SKILLS_DIR = path.join(REPO_ROOT, 'platforms', 'grok', 'skills');
const PREFLIGHT_SRC = path.join(REPO_ROOT, 'platforms', 'antigravity', 'scripts', 'antigravity-preflight.ps1');

const ACTIVE_RULES = [
  '00-runtime-and-intent.md',
  '00-universal-frontier-contract.md',
  '01-agent-workflow-sop.md',
  '02-code-quality-and-debt.md',
  '03-context-and-tools.md',
  '04-skills-and-5fedu.md',
  '05-harness-mutation-gate.md',
  '06-opus-emulation-contract.md',
  '07-finish-to-completion.md',
  'antigravity-overlay.md',
  'platform-boundary.md',
];

const LEGACY_RULES = [
  '00-hard-activation-contract.md',
  '00-antigravity-runtime-intent.md',
  '01-intent-contract.md',
  '10-fast-context.md',
  'prompt-intent-router.md',
  'quality-gates.md',
  'core.md',
  'planning.md',
  'execution.md',
  'clean-code.md',
  'technical-debt-control.md',
  'codex-overlay.md',
  'context-tools.md',
  'tool-inventory.md',
  'root-cause-verification.md',
  'default.rules',
];

const DEPRECATED_SKILLS = [
  'taste-skill',
  'soft-skill',
  'gpt-tasteskill',
  'redesign-skill',
  'imagegen-frontend-web',
  'imagegen-frontend-mobile',
];

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function rmDirSync(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function syncProject(projectDir, agentsFolderName = '.agents') {
  const projectName = path.basename(projectDir);
  const targetAgentsDir = path.join(projectDir, agentsFolderName);

  console.log(`\n========================================`);
  console.log(`Syncing project: ${projectName} (${agentsFolderName})`);
  console.log(`========================================`);

  if (!fs.existsSync(targetAgentsDir)) {
    console.log(`[Skip] ${agentsFolderName} folder not found in ${projectName}`);
    return;
  }

  for (const ep of ['AGENTS.md', 'INTENT.md', 'README.md']) {
    const src = path.join(MASTER_AGENTS_DIR, ep);
    const dest = path.join(targetAgentsDir, ep);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  [OK] Synced entrypoint: ${ep}`);
    }
  }

  const rulesSrcDir = path.join(MASTER_AGENTS_DIR, 'rules');
  const rulesDestDir = path.join(targetAgentsDir, 'rules');
  fs.mkdirSync(rulesDestDir, { recursive: true });

  let cleanedRulesCount = 0;
  for (const file of fs.readdirSync(rulesDestDir)) {
    if (!ACTIVE_RULES.includes(file)) {
      fs.unlinkSync(path.join(rulesDestDir, file));
      cleanedRulesCount++;
    }
  }
  for (const legacy of LEGACY_RULES) {
    const p = path.join(rulesDestDir, legacy);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      cleanedRulesCount++;
    }
  }
  if (cleanedRulesCount > 0) {
    console.log(`  [CLEANUP] Deleted ${cleanedRulesCount} obsolete rule files.`);
  }

  for (const rule of ACTIVE_RULES) {
    const src = path.join(rulesSrcDir, rule);
    const dest = path.join(rulesDestDir, rule);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`  [WARN] Missing master rule: ${rule}`);
    }
  }
  console.log(`  [OK] Rules synced (${ACTIVE_RULES.length} active rules).`);

  const skillsSrcDir = fs.existsSync(MASTER_SKILLS_DIR)
    ? MASTER_SKILLS_DIR
    : path.join(MASTER_AGENTS_DIR, 'skills');
  const skillsDestDir = path.join(targetAgentsDir, 'skills');
  fs.mkdirSync(skillsDestDir, { recursive: true });

  for (const ds of DEPRECATED_SKILLS) {
    rmDirSync(path.join(skillsDestDir, ds));
    const wf = path.join(targetAgentsDir, 'workflows', `${ds}.md`);
    if (fs.existsSync(wf)) fs.unlinkSync(wf);
  }

  if (fs.existsSync(skillsSrcDir)) {
    for (const entry of fs.readdirSync(skillsSrcDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = path.join(skillsSrcDir, entry.name);
      const dest = path.join(skillsDestDir, entry.name);
      rmDirSync(dest);
      copyDirSync(src, dest);
    }
    const count = fs.readdirSync(skillsDestDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
    console.log(`  [OK] Skills synced from ${path.basename(path.dirname(skillsSrcDir))}/${path.basename(skillsSrcDir)} (${count} folders).`);
  }

  const wfSrcDir = path.join(MASTER_AGENTS_DIR, 'workflows');
  const wfDestDir = path.join(targetAgentsDir, 'workflows');
  fs.mkdirSync(wfDestDir, { recursive: true });
  if (fs.existsSync(wfSrcDir)) {
    for (const file of fs.readdirSync(wfSrcDir)) {
      fs.copyFileSync(path.join(wfSrcDir, file), path.join(wfDestDir, file));
    }
  }

  const scriptsDestDir = path.join(projectDir, 'scripts');
  if (fs.existsSync(PREFLIGHT_SRC)) {
    fs.mkdirSync(scriptsDestDir, { recursive: true });
    fs.copyFileSync(PREFLIGHT_SRC, path.join(scriptsDestDir, 'antigravity-preflight.ps1'));
    console.log(`  [OK] Synced preflight script.`);
  }

  console.log(`[SUCCESS] Project ${projectName} synchronized.`);
}

function main() {
  console.log('Opus-emulation harness — sync all projects');
  console.log('Projects dir: ' + PROJECTS_DIR);

  if (!fs.existsSync(PROJECTS_DIR)) {
    console.error(`Projects directory not found: ${PROJECTS_DIR}`);
    process.exit(1);
  }

  for (const dir of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const fullPath = path.join(PROJECTS_DIR, dir.name);
    if (dir.name === 'agent-rules') continue;
    if (fs.existsSync(path.join(fullPath, '.agents'))) {
      syncProject(fullPath, '.agents');
    } else if (fs.existsSync(path.join(fullPath, '.agent'))) {
      syncProject(fullPath, '.agent');
    }
  }

  console.log('\nALL PROJECTS SYNCHRONIZATION COMPLETED.');
}

main();