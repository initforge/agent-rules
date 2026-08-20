import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reconcileAll, reconcileHosts } from "../src/runtime/reconcile.js";
import { REGISTERED_HOSTS } from "../src/runtime/contracts.js";

/**
 * Wiring regression: runtime reconcile must consume the canonical desired
 * runtime (selection manifest) on the real execution path and report the
 * canonical MCP provisioning state as a separate surface with installation
 * and activation split into independent fields — never as a single `ok`.
 */

const HASH = "a".repeat(64);

let root: string;
let tempHome: string;

async function installSelectionManifest(): Promise<void> {
  const dir = path.join(root, ".agent", "artifacts");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "selection-manifest.json"),
    JSON.stringify({ selected_external_skills: [{ id: "skill-a", source: "skills/skill-a" }] }),
  );
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "reconcile-wiring-"));
  tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "reconcile-home-"));
  process.env.USERPROFILE = tempHome;
  process.env.HOME = tempHome;
  await installSelectionManifest();
  const integ = path.join(root, "integrations");
  await fs.mkdir(integ, { recursive: true });
  await fs.writeFile(
    path.join(integ, "registry.json"),
    JSON.stringify({
      version: 2,
      integrations: [
        {
          id: "prov-a", kind: "mcp", policy: "recommended", profiles: [],
          source: { type: "npm", version: "1.0.0" }, capabilities: ["x"],
          triggers: [], sideEffects: "read-only", tokenClass: "low", permissions: ["read-only"],
          install: { type: "npm-global", handler: "prov-a", script: "", verify: "", uninstall: "" },
          nativeHosts: [], fallback: "", deprecatedAliases: [], priority: 10, activation: "explicit-only",
        },
      ],
    }),
  );
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(tempHome, { recursive: true, force: true });
});

describe("runtime reconcile wiring", () => {
  it("loads the canonical desired runtime from the selection manifest on the real path", async () => {
    const result = await reconcileHosts(["codex"], {
      installedOnly: false,
      reportOnly: true,
      root,
      desiredManagedFiles: async () => [],
    });
    // reconcileHosts does not mutate; projection shows the desired skill drift.
    const codex = result.reconciled.find((item) => item.host === "codex");
    expect(codex).toBeDefined();
    expect(codex!.projection?.desired.skills).toEqual([{ id: "skill-a", source: "skills/skill-a" }]);
  });

  it("reconcileAll reports canonical MCP provisioning as a separate, non-mutating surface", async () => {
    const result = await reconcileAll({ installedOnly: false, reportOnly: true, root });
    expect(result.providerProvisioning).toBeDefined();
    expect(result.providerProvisioning.kind).toBe("mcp");
    expect(result.providerProvisioning.total).toBe(1);
    const prov = result.providerProvisioning.results[0];
    expect(prov.id).toBe("prov-a");
    // Installation and activation are independent states, never merged.
    expect(prov.installation).toBeDefined();
    expect(prov.activation.policy).toBe("explicit-only");
    expect(prov.activation.status).toBe("NOT_ACTIVATED");
    expect(REGISTERED_HOSTS).toHaveLength(7);
  });
});