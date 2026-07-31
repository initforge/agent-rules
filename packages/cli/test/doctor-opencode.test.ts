import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { doctorOpenCode } from "../src/commands/doctor.js";

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
});
