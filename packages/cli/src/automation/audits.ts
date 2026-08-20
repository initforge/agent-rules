import fs from "node:fs/promises";
import path from "node:path";

async function checkFile(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function getFileContent(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf-8");
}

export async function auditUiRouting(root: string, runId: string, logPath: string): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  async function testFileContains(relPath: string, needles: string[], fallbackNeedles?: string[]) {
    const fullPath = path.join(root, relPath);
    if (!(await checkFile(fullPath))) {
      errors.push(`Missing file: ${fullPath}`);
      return false;
    }
    const body = (await getFileContent(fullPath)).toLowerCase();
    
    // PS script legacy handling
    const actualNeedles = fallbackNeedles && fullPath.includes('5fedu-module-parity') ? fallbackNeedles : needles;
    
    for (let n of actualNeedles) {
      // For needles with mojibake in PS, let's use regex for safety or plain match
      // In JS, read as UTF-8, it should just match the real words.
      let pattern = n.toLowerCase();
      // Replace PS regex fallbacks with JS regex
      pattern = pattern.replace(/\?/g, '.');
      
      const regex = new RegExp(pattern, "i");
      if (!regex.test(body)) {
        errors.push(`Missing keyword '${n}' in ${fullPath}`);
        return false;
      }
    }
    return true;
  }

  const publicSkillPath = path.join("skills", "5fedu-module-parity", "SKILL.md");
  if (await checkFile(path.join(root, publicSkillPath))) {
    await testFileContains(publicSkillPath, 
      ["làm module mới", "sửa module", "refactor module", "frontend-architect", "pattern-inventory", "shell parity", "variable map"],
      ["module", "frontend-architect", "pattern-inventory", "shell parity", "variable map"]
    );
  }

  await testFileContains(path.join("skills", "frontend-architect", "SKILL.md"), ["hard stop", "5fedu", "ui-delivery"]);

  const publicCtxMap = path.join("projects", "5fedu", "00-context-map.md");
  if (await checkFile(path.join(root, publicCtxMap))) {
    await testFileContains(publicCtxMap, ["l.m module m.i", "s.a module", "5fedu-module-parity", "c.m", "frontend-architect", "pattern-inventory"]);
  }

  const publicModuleMapping = path.join("projects", "5fedu", "domains", "module-mapping.md");
  if (await checkFile(path.join(root, publicModuleMapping))) {
    await testFileContains(publicModuleMapping, ["clone checklist", "audit checklist", "pattern-inventory", "shell", "variable"]);
  }

  await testFileContains(path.join("rules", "30-context-routing.md"), ["project/domain router", "matching leaf context", "capability", "new signal"]);

  const publicUiDelivery = path.join("projects", "5fedu", "domains", "ui-delivery.md");
  if (await checkFile(path.join(root, publicUiDelivery))) {
    await testFileContains(publicUiDelivery, ["t.o m.i", "s.a module", "generic", "pattern-inventory", "shell parity"]);
  }

  const publicAgents = path.join("projects", "5fedu", "AGENTS.md");
  if (await checkFile(path.join(root, publicAgents))) {
    await testFileContains(publicAgents, ["project-local", "t.o", "s.a"]);
  }

  if (logPath) {
    try {
      const logDir = path.dirname(logPath);
      await fs.mkdir(logDir, { recursive: true });
      const entry = {
        runId,
        timestamp: new Date().toISOString(),
        problemCount: errors.length,
        problems: errors
      };
      await fs.appendFile(logPath, JSON.stringify(entry, null, 2) + "\n", "utf-8");
    } catch {}
  }

  return { ok: errors.length === 0, errors };
}

export async function auditPlanArtifact(root: string, planPath?: string): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  async function testContains(relPath: string, patterns: string[]) {
    const fullPath = path.join(root, relPath);
    if (!(await checkFile(fullPath))) {
      errors.push(`Missing file: ${relPath}`);
      return;
    }
    const body = await getFileContent(fullPath);
    for (const pattern of patterns) {
      if (!new RegExp(pattern).test(body)) {
        errors.push(`${relPath} missing contract pattern: ${pattern}`);
      }
    }
  }

  await testContains(path.join("skills", "plan-and-handoff", "SKILL.md"), [
    "executable intent contract", "Ask only a question", "risk-triggered independent reviewer",
    "Source coverage", "automatically classify and begin execution", "portable-plan-contract"
  ]);

  await testContains(path.join("skills", "plan-and-handoff", "references", "adaptive-work-protocol.md"), [
    "Small", "Standard", "Resumable", "Context capsule", "main agent", "economy", "standard", "expert",
    "acknowledgment", "semantic budgets", "subagent_requested", "subagent_completed", "Independent review is mandatory"
  ]);

  await testContains(path.join("skills", "plan-and-handoff", "references", "portable-plan-contract.md"), [
    "small", "standard", "resumable", "acceptance", "execution_contract", "requirements", "decisions",
    "change_graph", "verification_matrix", "task_graph", "amendments", "checkpoints", "evidence_ledger",
    "supersedes", "fact", "assumption", "unknown", "user_decision"
  ]);

  await testContains(path.join("skills", "finish-to-completion", "references", "completion-ledger.md"), [
    "workctl\\.py", "source requirement", "per-assignment usage", "Self-reported PASS", "semantic", "pending", "acknowledged"
  ]);

  await testContains(path.join("automation", "workctl.py"), [
    "def classify", "active_slices", "acceptance_contract_hash", "command_verify", "independent PASS review",
    "command_resume", "command_finalize"
  ]);

  await testContains(path.join("automation", "work-ledger.schema.json"), [
    '"schema_version"', '"source_history"', '"assignments"', '"reviews"', '"artifact_evidence"', '"usageRecord"'
  ]);

  await testContains(path.join("rules", "25-task-lifecycle.md"), [
    "Assign clear roles", "Coordinator", "Architect/integrator", "Implementer", "Reviewer", "Verifier",
    "Researcher/utility", "Delegate when it adds value", "stable boundary", "clear ACs", "non-overlapping writes",
    "sufficient context", "meaningful parallelism", "Record what you delegated", "delegated", "outcome"
  ]);

  await testContains(path.join("skills", "plan-and-handoff", "references", "adaptive-work-protocol.md"), [
    "Coordinator", "Architect/integrator", "Implementer", "Researcher/utility", "Reviewer", "Verifier",
    "stable boundary", "non-overlapping write ownership", "meaningful benefit", "subagent_requested",
    "subagent_resolved", "subagent_started", "subagent_completed", "result_consumed", "result_rejected",
    "delegation_skipped"
  ]);

  const required = [
    path.join("automation", "test-workctl.py"),
    path.join("skills", "plan-and-handoff", "references", "capability-tier-routing.md")
  ];
  for (const req of required) {
    if (!(await checkFile(path.join(root, req)))) {
      errors.push(`Missing executable-plan component: ${req}`);
    }
  }

  if (planPath) {
    if (!(await checkFile(planPath))) {
      errors.push(`Plan file not found: ${planPath}`);
    } else {
      const body = await getFileContent(planPath);
      const patterns = [
        "Outcome|Kết quả", "scope|phạm vi", "Acceptance|nghiệm thu", "proof|bằng chứng|verify",
        "rollback|khôi phục", "file|interface|API|schema|entity"
      ];
      for (const pattern of patterns) {
        if (!new RegExp(pattern, "i").test(body)) {
          errors.push(`Plan lacks executable detail: ${pattern}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export async function auditWorkflowClarity(root: string): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  async function testContract(relPath: string, patterns: string[]) {
    const fullPath = path.join(root, relPath);
    if (!(await checkFile(fullPath))) {
      errors.push(`Missing file: ${relPath}`);
      return;
    }
    const body = await getFileContent(fullPath);
    for (const pattern of patterns) {
      if (!new RegExp(pattern).test(body)) {
        errors.push(`${relPath} missing workflow contract: ${pattern}`);
      }
    }
  }

  await testContract(path.join("rules", "00-bootstrap.md"), [
    "native Plan Mode", "explicit execute pivot", "Ask only a question", "main agent accountable"
  ]);
  await testContract(path.join("rules", "10-execution.md"), [
    "observable outcome", "Classify risk before work shape", "own orchestration",
    "local blocker does not stop independent work", "Match evidence to the claim", "build/lint proves static compatibility"
  ]);
  await testContract(path.join("rules", "25-task-lifecycle.md"), [
    "advisory", "plan", "execution", "small", "medium", "large", "resumable", "not a file-count",
    "Assign clear roles", "Coordinator", "Architect/integrator", "Delegate when it adds value", "separately from"
  ]);
  await testContract(path.join("skills", "plan-and-handoff", "references", "adaptive-work-protocol.md"), [
    "Automatic execution", "Meaningful questions", "economy", "standard", "expert", "risk-triggered",
    "ledger", "pending", "acknowledged", "recovery", "Coordinator", "Architect/integrator",
    "semantic budgets", "Independent review is mandatory", "Inspect only evidence"
  ]);
  await testContract(path.join("skills", "finish-to-completion", "SKILL.md"), [
    "execute pivot", "dependency-ready", "coordinator", "architect/integrator", "PARTIAL", "BLOCKED",
    "Delegate based on the five conditions", "orchestration `UNAVAILABLE`", "assignment acknowledgment"
  ]);

  const filesToCheck = [
    path.join("rules", "00-bootstrap.md"),
    path.join("rules", "10-execution.md"),
    path.join("rules", "25-task-lifecycle.md"),
    path.join("skills", "plan-and-handoff", "SKILL.md"),
    path.join("skills", "finish-to-completion", "SKILL.md")
  ];
  
  for (const relPath of filesToCheck) {
    const fullPath = path.join(root, relPath);
    if (await checkFile(fullPath)) {
      const body = await getFileContent(fullPath);
      const forbidden = ["HB-1", "PLAN_PASS", "SLICE_PASS", "file-count gate", "Stop-hook admission"];
      for (const forb of forbidden) {
        if (body.includes(forb)) {
          errors.push(`${relPath} retains obsolete ceremony: ${forb}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export async function validateToolRegistry(root: string): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const fail = (msg: string) => { errors.push(`registry: ${msg}`); };

  const registryPath = path.join(root, "integrations", "registry.json");
  if (!(await checkFile(registryPath))) {
    fail(`missing ${registryPath}`);
    return { ok: false, errors };
  }

  let registry: any;
  try {
    registry = JSON.parse(await getFileContent(registryPath));
  } catch (e: any) {
    fail(`invalid JSON: ${e.message}`);
    return { ok: false, errors };
  }

  const version = parseInt(registry.version, 10);
  if (version < 1 || version > 2) {
    fail(`expected version 1 or 2, got ${version}`);
  }
  if (!registry.integrations || !Array.isArray(registry.integrations) || registry.integrations.length === 0) {
    fail("integrations must be a non-empty array");
  }
  
  if (errors.length > 0) return { ok: false, errors };

  const requiredV1 = ["name", "policy", "path", "triggerClasses", "capabilityClass", "sideEffects", "tokenClass", "nativeHosts", "fallback", "proofStatus"];
  const requiredV2 = ["id", "displayName", "kind", "policy", "profiles", "source", "integrity", "trust", "capabilities", "triggers", "sideEffects", "tokenClass", "permissions", "install", "nativeHosts", "fallback", "deprecatedAliases"];
  
  const policies = ["required", "recommended", "optional"];
  const kinds = ["mcp", "tool", "adapter", "native", "cli-tool"];
  const tokenClasses = ["low", "medium", "high"];
  const trustStatuses = ["advisory-only", "declared", "adapter-verified", "native-live"];
  const sourceTypes = ["github", "npm", "git", "local", "rust-cargo"];
  const installTypes = ["binary", "npm-global", "npm-npx", "npx-github", "git", "local", "shell", "cargo"];

  const contractsPath = path.join(root, "platforms", "platform-contracts.json");
  if (!(await checkFile(contractsPath))) {
    fail(`platform contracts not found: ${contractsPath}`);
    return { ok: false, errors };
  }
  let hosts: string[] = [];
  try {
    const contracts = JSON.parse(await getFileContent(contractsPath));
    hosts = Object.keys(contracts.platforms);
  } catch {}

  const ids = new Set<string>();
  const allAliases = new Set<string>();

  for (const tool of registry.integrations) {
    let id, policy, proofStatus, triggers, capabilities, nativeHosts, aliases, source, install;
    const isV2 = "id" in tool;

    if (isV2) {
      for (const field of requiredV2) {
        if (!(field in tool)) { fail(`integration missing '${field}'`); }
      }
      id = tool.id; policy = tool.policy; proofStatus = tool.trust;
      triggers = tool.triggers || []; capabilities = tool.capabilities || [];
      nativeHosts = tool.nativeHosts || []; aliases = tool.deprecatedAliases || [];
      source = tool.source; install = tool.install;
    } else {
      id = tool.name; policy = tool.policy; proofStatus = tool.proofStatus;
      triggers = tool.triggerClasses || []; capabilities = tool.capabilityClass || [];
      nativeHosts = tool.nativeHosts || []; aliases = []; source = null; install = null;
    }

    if (!id) continue;
    if (ids.has(id)) { fail(`duplicate id '${id}'`); }
    ids.add(id);

    allAliases.add(id);
    for (const alias of aliases) {
      if (!alias) continue;
      if (allAliases.has(alias)) { fail(`alias '${alias}' of '${id}' conflicts with existing id/alias`); }
      allAliases.add(alias);
    }

    if (!policies.includes(policy)) fail(`${id} has invalid policy '${policy}'`);
    if (!tokenClasses.includes(tool.tokenClass)) fail(`${id} has invalid tokenClass '${tool.tokenClass}'`);
    if (!trustStatuses.includes(proofStatus)) fail(`${id} has invalid trust '${proofStatus}'`);
    if (triggers.length === 0) fail(`${id} needs triggers`);

    if (isV2) {
      if (!kinds.includes(tool.kind)) fail(`${id} has invalid kind '${tool.kind}'`);
      if (source && !sourceTypes.includes(source.type)) fail(`${id} has invalid source type '${source.type}'`);
      if (install) {
        if (!installTypes.includes(install.type)) fail(`${id} has invalid install type '${install.type}'`);
        const installScript = path.join(root, install.script || "");
        if (!(await checkFile(installScript))) fail(`${id} install script missing: ${install.script}`);
      }
      if (tool.health) {
        if (!tool.health.command) fail(`${id} needs health.command`);
        if (!tool.health.expectedExitCodes || tool.health.expectedExitCodes.length === 0) fail(`${id} needs health.expectedExitCodes`);
      }
      if (tool.schema?.source) {
        const schemaSourcePath = path.join(root, tool.schema.source.replace(/\//g, path.sep));
        if (!(await checkFile(schemaSourcePath))) fail(`${id} schema.source path missing: ${tool.schema.source}`);
      }
    } else {
      const toolPath = path.join(root, tool.path || "");
      if (!(await checkFile(toolPath))) fail(`${id} path is missing: ${tool.path}`);
    }

    for (const nativeHost of nativeHosts) {
      if (!hosts.includes(nativeHost)) fail(`${id} has invalid native host '${nativeHost}'`);
    }

    if (proofStatus === "native-live" && nativeHosts.length === 0) {
      fail(`${id} cannot be native-live without a native host`);
    }

    if (proofStatus === "adapter-verified") {
      for (const nativeHost of nativeHosts) {
        const extension = nativeHost === "codex" ? "toml" : "json";
        let adapterPath = tool.path;
        if (!adapterPath && install && install.script) {
          adapterPath = path.dirname(install.script).replace(/^(\.\.?[\/\\]?)/, '');
        }
        if (adapterPath) {
          const adapterFile = path.join(root, adapterPath, "adapters", `${nativeHost}.${extension}`);
          if (!(await checkFile(adapterFile))) {
            fail(`${id} lacks ${nativeHost} adapter required by adapter-verified proof`);
          }
        }
      }
    }
  }

  if (version >= 2 && registry.profiles) {
    for (const pName of Object.keys(registry.profiles)) {
      const profile = registry.profiles[pName];
      for (const ref of (profile.required || [])) {
        if (ref && !ids.has(ref)) fail(`profile '${pName}' references unknown integration '${ref}' in required`);
      }
      for (const ref of (profile.recommended || [])) {
        if (ref && !ids.has(ref)) fail(`profile '${pName}' references unknown integration '${ref}' in recommended`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
