#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));
const problems = [];
const dirs = (p) => fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
const files = (p) => fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name) : [];

const publicSkills = dirs(path.join(root, 'skills')).filter((name) => name.startsWith('5fedu-'));
if (publicSkills.length) problems.push(`[LEAK R1] 5fedu skills found in public skills/: ${publicSkills.join(', ')}. Must live in profiles/5fedu/skills/.`);

const projects = path.join(root, 'projects');
if (dirs(projects).includes('5fedu')) problems.push('[LEAK R2] 5fedu project template found in projects/. Must live in profiles/5fedu/projects/.');
if (fs.existsSync(path.join(projects, 'known-repos.md'))) problems.push('[LEAK R2] known-repos.md found in projects/. Must live in profiles/5fedu/known-repos.md.');

const automation = path.join(root, 'automation');
for (const prefix of ['08-install-5fedu-context', '10-export-5fedu-writeback', 'audit-5fedu', 'migrate-nostime', 'migrate-tahapp']) {
  const leaked = files(automation).find((name) => name.startsWith(prefix));
  if (leaked) problems.push(`[LEAK R3] Profile-owned script found in automation/: ${leaked}. Must live in profiles/5fedu/automation/.`);
}
const leakedProfiles = files(path.join(automation, 'profiles')).filter((name) => ['nostime.json', 'tah-app.json'].includes(name));
if (leakedProfiles.length) problems.push(`[LEAK R4] Profile-owned profiles found in automation/profiles/: ${leakedProfiles.join(', ')}. Must live in profiles/5fedu/automation/profiles/.`);

const profiles = path.join(root, 'profiles');
if (!fs.existsSync(profiles)) problems.push('[LEAK R5] Missing profiles/ directory.');
else {
  if (!fs.existsSync(path.join(profiles, 'manifest.yaml'))) problems.push('[LEAK R5] Missing profiles/manifest.yaml.');
  if (fs.existsSync(path.join(profiles, '5fedu')) && !fs.existsSync(path.join(profiles, '5fedu', 'profile.yaml'))) problems.push('[LEAK R5] Missing profiles/5fedu/profile.yaml.');
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log('5fedu leakage check PASS');
