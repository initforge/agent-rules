import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

describe("Package source archive", () => {
  const root = getRepoRoot();
  const archiveName = "agent-rules-source.zip";
  const archivePath = path.join(root, archiveName);

  it("creates source archive via git archive", () => {
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }

    execSync(`git archive --format=zip HEAD -o ${archiveName}`, {
      cwd: root,
      encoding: "utf-8",
    });

    expect(fs.existsSync(archivePath)).toBe(true);
    const stat = fs.statSync(archivePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("archive does not contain forbidden paths", () => {
    let files: string[];
    try {
      const output = execSync(`tar -tf ${archiveName}`, {
        cwd: root,
        encoding: "utf-8",
        timeout: 15000,
      });
      files = output.split("\n").map((f) => f.trim()).filter(Boolean);
    } catch {
      return;
    }

    const forbidden = files.filter(
      (f) =>
        f.startsWith("node_modules/") ||
        f.startsWith(".git/") ||
        f.startsWith(".agent/runs/"),
    );
    expect(forbidden).toEqual([]);
  });
});
