import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { goalCmd } from "../src/commands/goal.js";
import { ExitCode } from "../src/types.js";

/**
 * REQ-018 — the support pack is an optional projection: goal compiles the
 * canonical WorkRequest from the frozen contract even when no support pack
 * exists, instead of failing.
 */
describe("goal without a support pack (REQ-018)", () => {
  it("compiles a WorkRequest when the support pack is absent", async () => {
    const cwd = process.cwd();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "goal-no-pack-"));
    try {
      process.chdir(temp);
      const planId = "plan-a";
      const plansDir = path.join(temp, ".agent", "plans", planId);
      fs.mkdirSync(plansDir, { recursive: true });
      fs.writeFileSync(path.join(plansDir, "plan.md"), "# plan-a\n\nDo the thing.\n");

      const result = await goalCmd([planId, "--intent", "do the thing"], { json: true, dryRun: false, verbose: false });
      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.data?.support_pack).toBe("absent-optional");
      expect(result.data?.workRequest).toBeTruthy();
    } finally {
      process.chdir(cwd);
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it("still validates a present support pack with identity hashes", async () => {
    const cwd = process.cwd();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "goal-with-pack-"));
    try {
      process.chdir(temp);
      const planId = "plan-b";
      const packDir = path.join(temp, ".agent", "artifacts", planId, "support-pack");
      fs.mkdirSync(packDir, { recursive: true });
      const manifest = { manifestSha256: "", planRevision: 1, recipes: [], claimIds: [], requirementIds: [] };
      const pack = { packSha256: "", manifest };
      const logicalSha = (body: Record<string, unknown>, selfField: string): string => {
        const rest = { ...body };
        delete rest[selfField];
        const canonicalize = (value: unknown): unknown => {
          if (Array.isArray(value)) return value.map(canonicalize);
          if (value && typeof value === "object") {
            return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
          }
          return value;
        };
        return require("node:crypto").createHash("sha256").update(JSON.stringify(canonicalize(rest))).digest("hex");
      };
      manifest.manifestSha256 = logicalSha(manifest as unknown as Record<string, unknown>, "manifestSha256");
      pack.packSha256 = logicalSha(pack as unknown as Record<string, unknown>, "packSha256");
      fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(pack, null, 2));

      const result = await goalCmd([planId, "--intent", "do it"], { json: true, dryRun: false, verbose: false });
      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.data?.capability).toBe("EMULATED");
    } finally {
      process.chdir(cwd);
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
