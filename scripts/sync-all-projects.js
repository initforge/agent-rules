const fs = require('fs');
const path = require('path');

const PROJECTS_DIR = '/home/linhnxdeveloper/Projects';
const MASTER_AGENTS_DIR = '/home/linhnxdeveloper/Projects/agent-rules/antigravity/.agents';
const PREFLIGHT_SRC = '/home/linhnxdeveloper/Projects/agent-rules/antigravity/scripts/antigravity-preflight.js';

// List of allowed rule filenames
const ACTIVE_RULES = [
  '00-runtime-and-intent.md',
  '01-agent-workflow-sop.md',
  '02-code-quality-and-debt.md',
  '03-context-and-tools.md',
  'platform-boundary.md'
];

// List of deprecated skills to clean up
const DEPRECATED_SKILLS = [
  'taste-skill',
  'soft-skill',
  'gpt-tasteskill',
  'redesign-skill',
  'imagegen-frontend-web',
  'imagegen-frontend-mobile'
];

// Helper to recursively copy directories
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper to delete directory recursively
function rmDirSync(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function syncProject(projectDir) {
  const projectName = path.basename(projectDir);
  const targetAgentsDir = path.join(projectDir, '.agents');

  console.log(`\n========================================`);
  console.log(`Syncing project: ${projectName}`);
  console.log(`========================================`);

  if (!fs.existsSync(targetAgentsDir)) {
    console.log(`[Skip] .agents folder not found in ${projectName}`);
    return;
  }

  // --- 1. Entrypoints ---
  const entrypoints = ['AGENTS.md', 'INTENT.md', 'README.md'];
  for (const ep of entrypoints) {
    const src = path.join(MASTER_AGENTS_DIR, ep);
    const dest = path.join(targetAgentsDir, ep);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  [OK] Synced entrypoint: ${ep}`);
    }
  }

  // --- 2. Rules Sync & Cleanup ---
  const rulesSrcDir = path.join(MASTER_AGENTS_DIR, 'rules');
  const rulesDestDir = path.join(targetAgentsDir, 'rules');
  fs.mkdirSync(rulesDestDir, { recursive: true });

  // Delete all non-active rule files in target rules folder
  const targetRules = fs.readdirSync(rulesDestDir);
  let cleanedRulesCount = 0;
  for (const file of targetRules) {
    if (!ACTIVE_RULES.includes(file)) {
      fs.unlinkSync(path.join(rulesDestDir, file));
      cleanedRulesCount++;
    }
  }
  if (cleanedRulesCount > 0) {
    console.log(`  [CLEANUP] Deleted ${cleanedRulesCount} obsolete rule files.`);
  }

  // Copy active rule files from master
  for (const rule of ACTIVE_RULES) {
    const src = path.join(rulesSrcDir, rule);
    const dest = path.join(rulesDestDir, rule);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
  console.log(`  [OK] Rules synced (5 active rules).`);

  // --- 3. Skills Sync & Cleanup ---
  const skillsSrcDir = path.join(MASTER_AGENTS_DIR, 'skills');
  const skillsDestDir = path.join(targetAgentsDir, 'skills');
  fs.mkdirSync(skillsDestDir, { recursive: true });

  // Cleanup deprecated skills in target project
  for (const ds of DEPRECATED_SKILLS) {
    const targetDsPath = path.join(skillsDestDir, ds);
    const targetDsWfPath = path.join(targetAgentsDir, 'workflows', `${ds}.md`);
    if (fs.existsSync(targetDsPath)) {
      rmDirSync(targetDsPath);
      console.log(`  [CLEANUP] Removed deprecated skill folder: ${ds}`);
    }
    if (fs.existsSync(targetDsWfPath)) {
      fs.unlinkSync(targetDsWfPath);
      console.log(`  [CLEANUP] Removed deprecated workflow: ${ds}.md`);
    }
  }

  // Copy all skills from master
  const masterSkills = fs.readdirSync(skillsSrcDir, { withFileTypes: true });
  let skillsSyncedCount = 0;
  for (const entry of masterSkills) {
    if (entry.isDirectory()) {
      const src = path.join(skillsSrcDir, entry.name);
      const dest = path.join(skillsDestDir, entry.name);
      // Clean target skill folder before copying to avoid lingering files
      rmDirSync(dest);
      copyDirSync(src, dest);
      skillsSyncedCount++;
    } else if (entry.isFile() && entry.name === 'README.md') {
      fs.copyFileSync(path.join(skillsSrcDir, entry.name), path.join(skillsDestDir, entry.name));
    }
  }
  console.log(`  [OK] Synced ${skillsSyncedCount} skills (including restored UI/UX skills).`);

  // --- 4. Workflows ---
  const wfSrcDir = path.join(MASTER_AGENTS_DIR, 'workflows');
  const wfDestDir = path.join(targetAgentsDir, 'workflows');
  fs.mkdirSync(wfDestDir, { recursive: true });

  // Copy workflows from master
  if (fs.existsSync(wfSrcDir)) {
    const wfFiles = fs.readdirSync(wfSrcDir);
    for (const file of wfFiles) {
      fs.copyFileSync(path.join(wfSrcDir, file), path.join(wfDestDir, file));
    }
  }

  // Generate workflow stub for each active skill that doesn't have one
  const targetSkills = fs.readdirSync(skillsDestDir, { withFileTypes: true });
  let generatedWfCount = 0;
  for (const entry of targetSkills) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const wfFile = path.join(wfDestDir, `${entry.name}.md`);
      if (!fs.existsSync(wfFile)) {
        const wfContent = `# ${entry.name} Skill\n\n1. Read the skill file at \`.agents/skills/${entry.name}/SKILL.md\`.\n2. Inspect the current project files or request relevant context before starting work.\n3. Execute the skill instructions to fulfill the user's request.\n4. End with final status \`PASS\`, \`PARTIAL\`, or \`BLOCKED\`.\n`;
        fs.writeFileSync(wfFile, wfContent, 'utf8');
        generatedWfCount++;
      }
    }
  }
  const totalWfs = fs.readdirSync(wfDestDir).length;
  console.log(`  [OK] Workflows synced (${totalWfs} total workflows, ${generatedWfCount} newly generated stubs).`);

  // --- 5. Preflight Script ---
  const preflightDestDir = path.join(projectDir, 'scripts');
  if (fs.existsSync(PREFLIGHT_SRC)) {
    fs.mkdirSync(preflightDestDir, { recursive: true });
    fs.copyFileSync(PREFLIGHT_SRC, path.join(preflightDestDir, 'antigravity-preflight.js'));
    console.log(`  [OK] Synced preflight script.`);
  }

  console.log(`[SUCCESS] Project ${projectName} is fully synchronized!`);
}

function main() {
  console.log('Starting sync for all Projects under: ' + PROJECTS_DIR);
  
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.error(`Projects directory not found: ${PROJECTS_DIR}`);
    process.exit(1);
  }

  const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const fullPath = path.join(PROJECTS_DIR, dir.name);
      const targetAgents = path.join(fullPath, '.agents');
      if (fs.existsSync(targetAgents)) {
        syncProject(fullPath);
      }
    }
  }

  console.log('\n========================================');
  console.log('ALL PROJECTS SYNCHRONIZATION COMPLETED.');
  console.log('========================================');
}

main();
