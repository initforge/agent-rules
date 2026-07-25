import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

function findRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..', '..');
}
const ROOT = findRepoRoot();

function readJson(p: string): unknown {
  const content = fs.readFileSync(p, 'utf-8');
  return JSON.parse(content);
}

function readYaml(p: string): unknown {
  const content = fs.readFileSync(p, 'utf-8');
  return yaml.load(content);
}

function readFile(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

function resolve(p: string): string {
  return path.resolve(ROOT, p);
}

export interface CanonicalData {
  manifest: unknown;
  registry: unknown;
  profileManifest: unknown;
  modelPolicy: unknown;
  evidenceProfiles: unknown;
  triggerAudit: unknown;
  contextRouteCases: unknown;
  efficiencyPolicy: unknown;
  traceSchema: unknown;
  contextGraphSchema: unknown;
  workLedgerSchema: unknown;
  platformCapability: string;
  runtimeModel: string;
  integrationsSync: string;
}

export function readAll(): CanonicalData {
  return {
    manifest: readYaml(resolve('rules/manifest.yaml')),
    registry: readJson(resolve('integrations/registry.json')),
    profileManifest: readYaml(resolve('profiles/manifest.yaml')),
    modelPolicy: readJson(resolve('automation/model-policy.json')),
    evidenceProfiles: readJson(resolve('automation/evidence-profiles.json')),
    triggerAudit: readJson(resolve('automation/trigger-audit.json')),
    contextRouteCases: readJson(resolve('automation/context-route-cases.json')),
    efficiencyPolicy: readJson(resolve('automation/efficiency-policy.json')),
    traceSchema: readJson(resolve('automation/trace-schema.json')),
    contextGraphSchema: readJson(resolve('automation/context-graph.schema.json')),
    workLedgerSchema: readJson(resolve('automation/work-ledger.schema.json')),
    platformCapability: readFile(resolve('docs/guides/06-platform-capability.md')),
    runtimeModel: readFile(resolve('docs/guides/01-runtime-model.md')),
    integrationsSync: readFile(resolve('docs/guides/03-integrations-and-sync.md')),
  };
}

export function readPlatforms(): Record<string, unknown> {
  const contractsPath = resolve('platforms/platform-contracts.json');
  if (fs.existsSync(contractsPath)) {
    return JSON.parse(fs.readFileSync(contractsPath, 'utf-8'));
  }
  const platformsDir = resolve('platforms');
  const entries = fs.readdirSync(platformsDir, { withFileTypes: true });
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const runtimeYaml = path.join(platformsDir, entry.name, 'runtime.yaml');
      if (fs.existsSync(runtimeYaml)) {
        result[entry.name] = readYaml(runtimeYaml);
      }
    }
  }
  return result;
}

export function readSkills(): unknown[] {
  const skillsDir = resolve('skills');
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: unknown[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
      const hasSkill = fs.existsSync(skillMd);
      skills.push({ id: entry.name, hasSkill, path: `skills/${entry.name}/SKILL.md` });
    }
  }
  return skills;
}

export function readProfiles(): unknown[] {
  const profilesDir = resolve('profiles');
  const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
  const profiles: unknown[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      profiles.push({ id: entry.name, path: `profiles/${entry.name}/` });
    }
  }
  return profiles;
}

export function readAgents(): unknown[] {
  const agents: unknown[] = [];
  const platformsDir = resolve('platforms');
  const platformEntries = fs.readdirSync(platformsDir, { withFileTypes: true });
  for (const pEntry of platformEntries) {
    if (pEntry.isDirectory() && !pEntry.name.startsWith('.')) {
      const agentsDir = path.join(platformsDir, pEntry.name, 'agents');
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir);
        for (const file of agentFiles) {
          if (file.endsWith('.md')) {
            agents.push({ platform: pEntry.name, file, path: `platforms/${pEntry.name}/agents/${file}` });
          }
        }
      }
    }
  }
  return agents;
}

export function readIntegrations(): unknown[] {
  const registry = readJson(resolve('integrations/registry.json')) as { integrations: unknown[] };
  return registry.integrations || [];
}

export function readRawJson(filePath: string): unknown {
  return readJson(resolve(filePath));
}

export function readRawYaml(filePath: string): unknown {
  return readYaml(resolve(filePath));
}
