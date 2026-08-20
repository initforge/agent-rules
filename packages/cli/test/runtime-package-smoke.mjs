import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(cliRoot, "..", "..");
const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-rules-package-smoke-"));
const repo = path.join(temp, "repository");
const app = path.join(temp, "app");
const home = path.join(temp, "home");
const target = path.join(temp, "runtime-root");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const isolatedEnvKeys = new Set([
  "home", "userprofile", "appdata", "localappdata", "homedrive", "homepath", "tmp", "temp",
  "npm_config_cache", "npm_config_userconfig", "xdg_cache_home", "xdg_data_home", "xdg_config_home",
]);
const inheritedEnv = { ...process.env };
for (const key of Object.keys(inheritedEnv)) {
  if (isolatedEnvKeys.has(key.toLowerCase())) delete inheritedEnv[key];
}
const env = {
  ...inheritedEnv,
  HOME: home,
  USERPROFILE: home,
  CODEX_HOME: target,
  AGENT_RULES_REPOSITORY_ROOT: repo,
  NODE_ENV: "test",
  APPDATA: path.join(temp, "appdata"),
  LOCALAPPDATA: path.join(temp, "localappdata"),
  HOMEDRIVE: "",
  HOMEPATH: "",
  TMP: path.join(temp, "tmp"),
  TEMP: path.join(temp, "tmp"),
  npm_config_cache: path.join(temp, "npm-cache"),
  npm_config_userconfig: path.join(temp, "npmrc"),
  XDG_CACHE_HOME: path.join(temp, "cache"),
  XDG_DATA_HOME: path.join(temp, "data"),
  XDG_CONFIG_HOME: path.join(temp, "config"),
  PYTHONPYCACHEPREFIX: path.join(temp, "pycache"),
};
const run = (file, args, cwd = repo, options = {}) => {
  try {
    const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(file);
    return execFileSync(file, args, { cwd, env, encoding: "utf8", stdio: options.stdio ?? "pipe", shell });
  } catch (error) {
    throw new Error(`${file} ${args.join(" ")} failed (${error.status ?? error.code})\nstdout: ${String(error.stdout ?? "")}\nstderr: ${String(error.stderr ?? "")}`, { cause: error });
  }
};
const runNpm = (args, cwd = repo, options = {}) => npmExecPath
  ? run(process.execPath, [npmExecPath, ...args], cwd, options)
  : run(npmExecutable, args, cwd, options);

const writeSmokeLedger = async (ledger, identity, canonical) => {
  await fsp.mkdir(path.dirname(ledger), { recursive: true });
  const body = `${JSON.stringify({ effective_plan_identity: { sha256: identity, canonical_json_utf8: canonical } }, null, 2)}\n`;
  await fsp.writeFile(ledger, body);
  const pointerPath = path.join(repo, ".agent", "current.json");
  const pointer = JSON.parse(await fsp.readFile(pointerPath, "utf8"));
  pointer.canonical_ledger = {
    ...pointer.canonical_ledger,
    path: ".agent/ledger/smoke.json",
    sha256: createHash("sha256").update(body).digest("hex"),
    observed_effective_sha256: identity,
  };
  await fsp.writeFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`);
};

const snapshotTree = async (root) => {
  const entries = [];
  const visit = async (directory, prefix = "") => {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const relative = path.join(prefix, entry.name);
      entries.push(relative);
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
    }
  };
  try { await visit(root); } catch { /* profile root may not exist yet */ }
  return entries.sort();
};

try {
  await fsp.mkdir(app, { recursive: true });
  if (process.platform === "win32") {
    await fsp.mkdir(path.join(home, "AppData", "Local"), { recursive: true });
    await fsp.mkdir(path.join(home, "AppData", "Roaming"), { recursive: true });
    await fsp.mkdir(path.join(home, "AppData", "Local", "Microsoft", "PowerShell", "StartupProfileData-NonInteractive"), { recursive: true });
  }
  run("git", ["clone", "--quiet", "--no-hardlinks", sourceRoot, repo], temp);
  const canonical = JSON.stringify({ original_plan_sha256: "0".repeat(64), approved_amendments: [] });
  const identity = createHash("sha256").update(canonical).digest("hex");
  const ledger = path.join(repo, ".agent", "ledger", "smoke.json");
  await writeSmokeLedger(ledger, identity, canonical);
  run("git", ["add", "-f", ".agent/ledger/smoke.json"]);
  run("git", ["-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid", "commit", "-qm", "smoke ledger"]);

  const pack = (directory) => {
    const result = JSON.parse(runNpm(["pack", "--json"], directory));
    return Array.isArray(result) ? result[0] : Object.values(result)[0];
  };
  runNpm(["run", "build", "-w", "packages/kernel"], sourceRoot);
  runNpm(["run", "build", "-w", "packages/engine"], sourceRoot);
  runNpm(["run", "build", "-w", "packages/cli"], sourceRoot);
  const kernelPackage = path.join(temp, "kernel-package");
  const enginePackage = path.join(temp, "engine-package");
  await fsp.mkdir(kernelPackage);
  await fsp.mkdir(enginePackage);
  await fsp.cp(path.join(sourceRoot, "packages", "kernel", "dist"), path.join(kernelPackage, "dist"), { recursive: true });
  await fsp.copyFile(path.join(sourceRoot, "packages", "kernel", "package.json"), path.join(kernelPackage, "package.json"));
  await fsp.cp(path.join(sourceRoot, "packages", "engine", "dist"), path.join(enginePackage, "dist"), { recursive: true });
  await fsp.copyFile(path.join(sourceRoot, "packages", "engine", "package.json"), path.join(enginePackage, "package.json"));
  const kernelPack = pack(kernelPackage);
  const kernelTar = path.join(kernelPackage, kernelPack.filename);
  const enginePack = pack(enginePackage);
  const engineTar = path.join(enginePackage, enginePack.filename);
  const cliDirectory = path.join(sourceRoot, "packages", "cli");
  const cliPack = pack(cliDirectory);
  const cliTar = path.join(cliDirectory, cliPack.filename);
  const cliMetadata = JSON.parse(await fsp.readFile(path.join(cliDirectory, "package.json"), "utf8"));
  assert.equal(cliMetadata.private, true, "installer artifact intentionally remains registry-private");
  assert.ok(cliPack.files.some((file) => file.path === "dist/index.js"), "package must contain executable build");
  assert.equal(cliPack.files.some((file) => file.path.startsWith("src/") || file.path.startsWith("test/")), false, "package must exclude source/tests");
  try {
    runNpm(["init", "-y"], app);
    runNpm(["install", kernelTar, engineTar, cliTar], app);
    const homeBefore = await snapshotTree(home);
    const bin = path.join(app, "node_modules", ".bin", process.platform === "win32" ? "agent-rules.cmd" : "agent-rules");
    const cliShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
    const cli = (...args) => run(bin, ["--json", ...args]);
    cli("build");
    await fsp.rm(path.dirname(ledger), { recursive: true, force: true });
    await writeSmokeLedger(ledger, identity, canonical);
    const installed = spawnSync(bin, ["--json", "runtime", "install", "codex", "--root", target], { cwd: repo, env, encoding: "utf8", shell: cliShell });
    assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);
    const checked = spawnSync(bin, ["--json", "doctor", "codex", "--skip-integration-verify"], { cwd: repo, env, encoding: "utf8", shell: cliShell });
    const doctor = JSON.parse(checked.stdout.slice(checked.stdout.indexOf("{")));
    assert.ok(doctor.data.report.some((item) => item.check === "install" && item.status === "INSTALL_PASS"));
    cli("runtime", "update", "codex", "--root", target);
    cli("runtime", "rollback", "codex", "--root", target);
    cli("runtime", "reinstall", "codex", "--root", target);
    const installerUrl = pathToFileURL(path.join(app, "node_modules", "@initforge", "agent-rules", "dist", "runtime", "installer.js")).href;
    const injector = `import { RuntimeInstaller } from ${JSON.stringify(installerUrl)};\nconst i=new RuntimeInstaller({repositoryRoot:${JSON.stringify(repo)},platformRoots:{codex:${JSON.stringify(target)}},failpoint:"crash-after-backup"});await i.install("codex","update");`;
    const crashed = spawnSync(process.execPath, ["--input-type=module", "--eval", injector], { cwd: repo, env, encoding: "utf8" });
    assert.notEqual(crashed.status, 0, "injected post-journal crash must fail");
    assert.equal(fs.existsSync(path.join(target, ".agent-rules-runtime.transaction.json")), true);
    cli("runtime", "recover", "codex", "--root", target);
    assert.equal(fs.existsSync(path.join(target, ".agent-rules-runtime.transaction.json")), false);
    assert.equal((await fsp.readdir(target)).some((name) => name.startsWith(".agent-rules-runtime.stage-")), false);

    const malicious = path.join(temp, "malicious");
    await fsp.mkdir(malicious);
    const rejected = spawnSync(bin, ["--json", "runtime", "install", "codex", "--root", path.join(temp, "malicious-target")], {
      cwd: malicious,
      env: { ...env, NODE_ENV: "production", AGENT_RULES_REPOSITORY_ROOT: malicious },
      encoding: "utf8",
      shell: cliShell,
    });
    assert.notEqual(rejected.status, 0, "production must reject repository-root injection");
    assert.match(`${rejected.stdout}${rejected.stderr}`, /test-only and unavailable in production/);

    const manifest = path.join(repo, "generated", "runtime-build", "codex", "manifest.json");
    const original = await fsp.readFile(manifest, "utf8");
    await fsp.writeFile(manifest, "{broken\n");
    const failed = spawnSync(bin, ["--json", "runtime", "update", "codex", "--root", target], { cwd: repo, env, encoding: "utf8", shell: cliShell });
    assert.notEqual(failed.status, 0, "invalid package input must fail");
    assert.equal(fs.existsSync(path.join(target, ".agent-rules-runtime.transaction.json")), false);
    assert.equal((await fsp.readdir(target)).some((name) => name.startsWith(".agent-rules-runtime.stage-")), false);
    await fsp.writeFile(manifest, original);
    cli("runtime", "uninstall", "codex", "--root", target);
    assert.equal(fs.existsSync(path.join(target, "agent-rules-runtime")), false);
    assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
    assert.deepEqual(await snapshotTree(home), homeBefore, "CLI must not mutate HOME");
  } finally {
    await Promise.all([fsp.rm(kernelTar, { force: true }), fsp.rm(engineTar, { force: true }), fsp.rm(cliTar, { force: true })]);
  }
} finally {
  await fsp.rm(temp, { recursive: true, force: true });
}
