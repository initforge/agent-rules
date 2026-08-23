import { describe, expect, it } from "vitest";
import { platformCmd } from "../src/commands/platform.js";
import { profileCmd } from "../src/commands/profile.js";

const options = { json: true, dryRun: false, verbose: false } as const;

describe("platform/profile command contracts", () => {
  it("derives supported platforms from the canonical platform contract", async () => {
    const result = await platformCmd(["list"], options);
    expect(result.exitCode).toBe(0);
    const names = (result.data as { platforms: Array<{ name: string }> }).platforms.map((p) => p.name);
    expect(names).toContain("claude");
    expect(names).not.toContain("retired-platform");
    expect(names).toContain("opencode");
  });

  it("lists all registered platforms including cursor and opencode", async () => {
    const result = await platformCmd(["list"], options);
    expect(result.exitCode).toBe(0);
    const names = (result.data as { platforms: Array<{ name: string }> }).platforms.map((p) => p.name);
    expect(names).toContain("cursor");
    expect(names).toContain("claude");
  });

  it("shows Claude from the canonical platform contract", async () => {
    const result = await platformCmd(["show", "claude"], options);
    expect(result.exitCode).toBe(0);
    expect((result.data as { contract: unknown }).contract).toBeTruthy();
  });

  it("accepts a two-token profile subcommand contract", async () => {
    const list = await profileCmd(["list"], options);
    expect(list.exitCode).toBe(0);
    // Proves the command handler accepts a separate subcommand argument even if the fixture profile is absent.
    const show = await profileCmd(["show", "definitely-missing-profile"], options);
    expect(show.message).toContain("Profile not found");
  });
});
