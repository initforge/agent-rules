// OpenCode artifact smoke: builds generated/runtime-build/opencode from the
// canonical source (platforms/opencode + plan-identity fixture) and verifies the
// manifest contract binds the policy-resolved model, effective identity, and
// every file hash. Runs as the postbuild step of `npm run build` (tsc must run
// first so ../dist/runtime/opencode.js exists).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenCodeModel, buildOpenCodeArtifact } from "../dist/runtime/opencode.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const buildRoot = path.join(root, "generated", "runtime-build");

const openCodeModel = await resolveOpenCodeModel(root);
const artifact = await buildOpenCodeArtifact(root, buildRoot);
assert.equal(artifact.requested_model, openCodeModel, "requested_model must bind the policy-resolved model");
assert.equal(artifact.resolved_model, openCodeModel, "resolved_model must bind the policy-resolved model (no fabricated concrete model)");
assert.equal(artifact.observed_model, null, "observed_model must stay null without a native observation");
assert.equal(artifact.attestation_status, "UNVERIFIED", "attestation must not claim PASS");
assert.equal(artifact.native_capability, "UNAVAILABLE", "native capability must stay UNAVAILABLE");
assert.match(artifact.effective_identity, /^[a-f0-9]{64}$/, "effective_identity must bind the canonical plan identity sha256");
assert.ok(artifact.files.length > 0, "artifact must contain files");
for (const file of artifact.files) {
  const bytes = await fs.readFile(path.join(buildRoot, "opencode", file.path));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `file hash mismatch: ${file.path}`);
}
for (const file of artifact.files.filter((f) => f.path.startsWith("native/agents/") && !f.path.endsWith("/README.md"))) {
  const body = await fs.readFile(path.join(buildRoot, "opencode", file.path), "utf8");
  assert.ok(!body.includes("__OPENCODE_MODEL_CLASS__"), `template token leaked into ${file.path}`);
  assert.ok(body.includes(`model: ${openCodeModel}`), `policy model not rendered into ${file.path}`);
}
// stderr: keeps `npm pack --json` / `npm run build` stdout pure for JSON consumers.
console.error(`OpenCode artifact smoke: PASS (requested/resolved=${openCodeModel}, identity=${artifact.effective_identity}, files=${artifact.files.length})`);
