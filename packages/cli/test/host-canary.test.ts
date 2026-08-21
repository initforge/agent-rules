/**
 * host-canary CLI — per-host capability certification. LIVE_CERTIFIED only from
 * a live binary probe; absent hosts stay NOT_LIVE_VERIFIED; unknown hosts fail.
 */
import { describe, it, expect } from "vitest";
import { hostCanaryCmd } from "../src/commands/host-canary.js";
import { ExitCode } from "../src/types.js";

describe("host-canary CLI", () => {
  it("rejects an unknown host", async () => {
    const result = await hostCanaryCmd(["not-a-host"], { json: false, dryRun: false, verbose: false });
    expect(result.exitCode).toBe(ExitCode.InvalidArgument);
    expect(result.message).toContain("unknown host");
  });

  it("requires a host argument", async () => {
    const result = await hostCanaryCmd([], { json: false, dryRun: false, verbose: false });
    expect(result.exitCode).toBe(ExitCode.InvalidArgument);
    expect(result.message).toContain("Usage");
  });

  it("reports NOT_LIVE_VERIFIED/UNSUPPORTED for an absent host without fabricating live certification", async () => {
    const result = await hostCanaryCmd(["cursor"], { json: false, dryRun: false, verbose: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    // From the CLI package cwd there is no platforms/cursor projection, so the
    // honest state is UNSUPPORTED; from the repo root with no binary it would
    // be NOT_LIVE_VERIFIED. Either way it must never be LIVE_CERTIFIED.
    expect(["NOT_LIVE_VERIFIED", "UNSUPPORTED"]).toContain(result.data?.state);
    expect(result.data?.probe?.ok).toBe(false);
  });

  it("emits a capability fingerprint and per-capability certifications", async () => {
    const result = await hostCanaryCmd(["claude"], { json: false, dryRun: false, verbose: false });
    expect(result.data?.capability_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Array.isArray(result.data?.certifications)).toBe(true);
    expect((result.data?.certifications as Array<{ capability: string }>).length).toBeGreaterThan(0);
  });
});
