import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { doctorOpenCode } from "../src/commands/doctor.js";
import { RuntimeInstaller } from "../src/runtime/installer.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe("doctorOpenCode", () => {
  it("fails closed on installed agent tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-opencode-"));
    const source = path.join(root, "platforms/opencode/agents");
    const build = path.join(root, "generated/runtime-build/opencode/native/agents");
    const home = path.join(root, "home");
    await Promise.all([source, build, path.join(home, "agents")].map((dir) => fs.mkdir(dir, { recursive: true })));
    await fs.writeFile(path.join(source, "initforge-implementer.md"), "source\n");
    await fs.copyFile(path.join(source, "initforge-implementer.md"), path.join(build, "initforge-implementer.md"));
    await fs.writeFile(path.join(home, "agents/initforge-implementer.md"), "tampered\n");
    await fs.writeFile(path.join(home, "agent-rules-manifest.json"), JSON.stringify({ platform: "opencode", files: [{ path: "agents/initforge-implementer.md", sha256: hash("source\n") }] }));
    const result = await doctorOpenCode(root, home);
    expect(result.some((check) => check.status === "NOT_LIVE")).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("validates a clean transactional home and leaves native activation unverified", async () => {
    const repositoryRoot = process.cwd();
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "doctor-opencode-clean-"));
    try {
      await new RuntimeInstaller({ repositoryRoot, platformRoots: { opencode: home } }).install("opencode");
      const report = await doctorOpenCode(repositoryRoot, home);
      expect(report.find((check) => check.check === "runtime-manifest")?.status).toBe("OK");
      expect(report.find((check) => check.check === "native-activation")?.status).toBe("NATIVE_UNVERIFIED");
      expect(await fs.stat(path.join(home, "agent-rules-runtime", "agent-rules-runtime-receipt.json"))).toBeTruthy();
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});
