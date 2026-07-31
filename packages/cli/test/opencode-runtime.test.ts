import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildOpenCodeArtifact, installOpenCodeArtifact } from "../src/runtime/opencode.js";

const repo = path.resolve(import.meta.dirname, "../../..");

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-artifact-"));
  await fs.cp(path.join(repo, "platforms", "opencode"), path.join(root, "platforms", "opencode"), { recursive: true });
  await fs.cp(path.join(repo, "packages/engine/test/fixtures/plan-identity"), path.join(root, "packages/engine/test/fixtures/plan-identity"), { recursive: true });
  // buildOpenCodeArtifact resolves the model from the root's policy lazily.
  await fs.mkdir(path.join(root, "automation"), { recursive: true });
  await fs.copyFile(path.join(repo, "automation", "model-policy.json"), path.join(root, "automation", "model-policy.json"));
  await buildOpenCodeArtifact(root, path.join(root, "generated", "runtime-build"));
  return root;
}

describe("native OpenCode artifact identity", () => {
  it("rejects a tampered manifest", async () => {
    const root = await fixture();
    const manifest = path.join(root, "generated/runtime-build/opencode/manifest.json");
    const value = JSON.parse(await fs.readFile(manifest, "utf8")); value.effective_identity = "0".repeat(64);
    await fs.writeFile(manifest, JSON.stringify(value));
    await expect(installOpenCodeArtifact(root, path.join(root, "project"))).rejects.toThrow("identity invalid");
  });

  it("rejects modified canonical files", async () => {
    const root = await fixture();
    await fs.appendFile(path.join(root, "platforms/opencode/opencode-overlay.md"), "tamper\n");
    await expect(installOpenCodeArtifact(root, path.join(root, "project"))).rejects.toThrow("identity invalid");
  });

  it("rejects a self-consistent modified artifact", async () => {
    const root = await fixture();
    const manifest = path.join(root, "generated/runtime-build/opencode/manifest.json");
    const value = JSON.parse(await fs.readFile(manifest, "utf8")); value.requested_model = "other/provider";
    await fs.writeFile(manifest, JSON.stringify(value));
    await expect(installOpenCodeArtifact(root, path.join(root, "project"))).rejects.toThrow("identity invalid");
  });

  it("preserves and validates the requested/resolved/observed model contract", async () => {
    const root = await fixture();
    const manifest = path.join(root, "generated/runtime-build/opencode/manifest.json");
    const value = JSON.parse(await fs.readFile(manifest, "utf8"));
    value.resolved_model = "qwencoder/qwen3.7-max";
    await fs.writeFile(manifest, JSON.stringify(value));
    await expect(installOpenCodeArtifact(root, path.join(root, "project"))).rejects.toThrow("canonical source contract mismatch");
  });

  it("does not substitute fixture paths for canonical plan files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-missing-plan-"));
    await fs.cp(path.join(repo, "platforms", "opencode"), path.join(root, "platforms", "opencode"), { recursive: true });
    await fs.cp(path.join(repo, "packages/engine/test/fixtures/plan-identity"), path.join(root, "packages/engine/test/fixtures/plan-identity"), { recursive: true });
    await fs.mkdir(path.join(root, "automation"), { recursive: true });
    await fs.copyFile(path.join(repo, "automation", "model-policy.json"), path.join(root, "automation", "model-policy.json"));
    await fs.rm(path.join(root, "packages/engine/test/fixtures/plan-identity/original.md"));
    await fs.mkdir(path.join(root, ".agent/ledger"), { recursive: true });
    await fs.writeFile(path.join(root, ".agent/ledger/fixture.json"), JSON.stringify({ original_plan: { path: ".agent/plans/missing/original.md" }, amendments: [] }));
    await expect(buildOpenCodeArtifact(root, path.join(root, "generated/runtime-build"))).rejects.toThrow();
  });
});
