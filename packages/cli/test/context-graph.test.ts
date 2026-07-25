import { describe, it, expect } from "vitest";
import { buildContextGraph, validateGraph } from "../src/services/context-graph.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function countLinesInSources(root: string, sources: string[]): number {
  let total = 0;
  for (const src of sources) {
    try {
      const p = path.join(root, ...src.split("/"));
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        total += content.split("\n").length;
      }
    } catch { /* skip */ }
  }
  return total;
}

describe("ContextGraph", () => {
  const root = getRepoRoot();

  it("builds context graph without duplicate IDs", () => {
    const graph = buildContextGraph(root);
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    if (result.errors.length > 0) {
      console.error("Validation errors:", result.errors);
    }
    expect(result.errors).toHaveLength(0);
  });

  it("reports node count, line count, and source count", () => {
    const graph = buildContextGraph(root);
    const result = validateGraph(graph);
    const stats = result.stats;

    expect(stats.totalNodes).toBeGreaterThan(0);

    const lineCount = countLinesInSources(root, graph.nodes.map(n => n.source));

    console.log(`Context Graph Stats:
  Total nodes:  ${stats.totalNodes}
  Total tokens: ${stats.totalTokens}
  Line count:   ${lineCount}
  Source count: ${stats.sourceCount}
  Missing:      ${stats.missingSources}
  Layers:       ${JSON.stringify(stats.nodesByLayer)}`);

    expect(stats.totalNodes).toBeGreaterThan(20);
    expect(lineCount).toBeGreaterThan(1000);
    expect(stats.sourceCount).toBeGreaterThan(10);
    expect(stats.missingSources).toBe(0);
  });

  it("counts nodes by layer", () => {
    const graph = buildContextGraph(root);
    const result = validateGraph(graph);
    const layers = result.stats.nodesByLayer;

    expect(layers.rules).toBeGreaterThan(0);
    expect(layers.skills).toBeGreaterThan(0);
    expect(layers.project).toBeGreaterThan(0);

    console.log("Nodes by layer:", JSON.stringify(layers, null, 2));
  });

  it("throws on duplicate node ID", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-dup-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "rules"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "rules", "manifest.yaml"), "load_order:\n  - 00-test.md\n");
      fs.writeFileSync(path.join(tmpDir, "rules", "00-test.md"), "---\nrouting: {}\n---\n# Test rule\n");

      fs.mkdirSync(path.join(tmpDir, "skills", "dup-skill"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "skills", "dup-skill", "SKILL.md"), "---\nrouting: {}\n---\n# Skill\n");

      fs.mkdirSync(path.join(tmpDir, "profiles", "test-profile", "skills", "dup-skill"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "profiles", "test-profile", "skills", "dup-skill", "SKILL.md"), "---\nrouting: {}\n---\n# Duplicate skill\n");

      expect(() => buildContextGraph(tmpDir)).toThrow("Duplicate node ID: skill:dup-skill");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
