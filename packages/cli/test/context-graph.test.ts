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
    expect(layers.profile).toBeGreaterThan(0);

    console.log("Nodes by layer:", JSON.stringify(layers, null, 2));
  });

  it("keeps pinned upstream source packs packaged but outside graph routing and budgets", () => {
    const graph = buildContextGraph(root);
    const sources = graph.nodes.map(node => node.source);
    expect(sources).toContain("skills/ui-taste/SKILL.md");
    expect(sources.some(source => source.startsWith("skills/ui-taste/references/upstream/"))).toBe(false);
    expect(graph.nodes.some(node => node.id.includes("ui-taste:skills:ui-taste:references:upstream"))).toBe(false);
  });

  it("uses 5fedu profile nodes instead of its historical projects tree", () => {
    const graph = buildContextGraph(root);
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    expect(nodesById.get("profile:5fedu:readme")?.source).toBe("profiles/5fedu/README.md");
    expect(nodesById.get("profile:5fedu:rule:business")?.source).toBe("profiles/5fedu/rules/business.md");
    expect(nodesById.get("profile:5fedu:rule:data-auth")?.source).toBe("profiles/5fedu/rules/data-auth.md");
    expect(nodesById.get("profile:5fedu:rule:permissions")?.source).toBe("profiles/5fedu/rules/permissions.md");
    expect(nodesById.get("profile:5fedu:module-mapping")?.source).toBe("profiles/5fedu/module-mapping/modules.yaml");
    expect(nodesById.get("profile:5fedu:ui-contracts")?.source).toBe("profiles/5fedu/module-mapping/ui-contracts.md");
    expect(graph.nodes.some(node => node.source.startsWith("profiles/5fedu/projects/"))).toBe(false);
  });

  it("keeps activation metadata narrow in a fresh 5fedu UI graph", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-5fedu-ui-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "rules"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "rules", "manifest.yaml"), "load_order:\n  - 00-test.md\n");
      fs.writeFileSync(path.join(tmpDir, "rules", "00-test.md"), "---\nrouting: {}\n---\n# Test rule\n");
      const parityRoot = path.join(tmpDir, "skills", "5fedu-module-parity");
      fs.mkdirSync(path.join(parityRoot, "references"), { recursive: true });
      fs.writeFileSync(path.join(parityRoot, "SKILL.md"), [
        "---",
        "routing: {\"signals\":[\"5fedu\",\"drawer\"],\"intent_signals\":[\"5fedu_ui\"],\"loads\":[\"profile:5fedu:module-mapping\",\"profile:5fedu:ui-contracts\",\"skills/5fedu-module-parity/references/index.md\"]}",
        "---",
        "# Parity",
      ].join("\n"));
      fs.writeFileSync(path.join(parityRoot, "references", "index.md"), "# Reference index\n");
      const profileRoot = path.join(tmpDir, "profiles", "5fedu");
      fs.mkdirSync(path.join(profileRoot, "behaviors"), { recursive: true });
      fs.mkdirSync(path.join(profileRoot, "module-mapping"), { recursive: true });
      fs.writeFileSync(path.join(profileRoot, "README.md"), "# 5fedu\n");
      fs.writeFileSync(path.join(profileRoot, "behaviors", "activation.md"), "# Activation\n");
      fs.writeFileSync(path.join(profileRoot, "module-mapping", "modules.yaml"), "modules: []\n");
      fs.writeFileSync(path.join(profileRoot, "module-mapping", "ui-contracts.md"), "# UI contracts\n");

      const graph = buildContextGraph(tmpDir);
      const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
      const parity = nodesById.get("skill:5fedu-module-parity")!;
      const loaded = new Set(parity.routing.loads as string[]);
      const uiPrompt = "Sửa module 5fedu lệch pattern drawer".toLowerCase();
      const contextNodes = graph.nodes
        .filter(node => {
          if (node.id === "profile:5fedu:readme" || loaded.has(node.id) || loaded.has(node.source)) return true;
          if (node.layer !== "profile" || node.routing.project_scope !== "5fedu") return false;
          return (node.routing.signals as string[]).some(signal => uiPrompt.includes(signal.toLowerCase()));
        })
        .map(node => node.id)
        .sort();
      expect(contextNodes).toEqual([
        "profile:5fedu:module-mapping",
        "profile:5fedu:readme",
        "profile:5fedu:ui-contracts",
        "reference:5fedu-module-parity:skills:5fedu:module:parity:references:index:md",
      ]);

      const activation = nodesById.get("profile:5fedu:behavior:activation")!;
      expect(activation.routing.signals).not.toContain("5fedu");
      expect(activation.routing.intent_signals).toEqual(["5fedu_activation", "5fedu_setup"]);
      expect((activation.routing.signals as string[])).toContain("thiết lập 5fedu");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps the declared 5fedu UI pack canonical and within its route budget", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(root, "automation", "context-route-cases.json"), "utf-8")) as {
      budgets: { "5fedu_ui_base_tokens": number };
      routes: { "5fedu_ui_base": string[] };
    };
    const routePack = fixture.routes["5fedu_ui_base"];
    expect(routePack).toEqual([
      "profiles/5fedu/README.md",
      "skills/5fedu-project/SKILL.md",
      "skills/5fedu-module-parity/SKILL.md",
      "skills/5fedu-module-parity/references/index.md",
      "profiles/5fedu/module-mapping/modules.yaml",
      "profiles/5fedu/module-mapping/ui-contracts.md",
    ]);
    expect(routePack.some(source => source.startsWith("profiles/5fedu/projects/"))).toBe(false);
    for (const source of routePack) {
      expect(fs.existsSync(path.join(root, source))).toBe(true);
    }
    const tokens = routePack.reduce(
      (total, source) => total + Math.ceil(fs.readFileSync(path.join(root, source), "utf-8").length / 3.6),
      0,
    );
    expect(tokens).toBeLessThanOrEqual(fixture.budgets["5fedu_ui_base_tokens"]);
  });

  it("loads only the declared 5fedu parity context and concise asset index", () => {
    const graph = buildContextGraph(root);
    const parity = graph.nodes.find(node => node.id === "skill:5fedu-module-parity");
    expect(parity?.routing.loads).toEqual([
      "profile:5fedu:module-mapping",
      "profile:5fedu:ui-contracts",
      "skills/5fedu-module-parity/references/index.md",
    ]);

    const loadedSources = new Set(graph.nodes
      .filter(node => (parity?.routing.loads as string[]).includes(node.id) || (parity?.routing.loads as string[]).includes(node.source))
      .map(node => node.source));
    expect(loadedSources).toEqual(new Set([
      "profiles/5fedu/module-mapping/modules.yaml",
      "profiles/5fedu/module-mapping/ui-contracts.md",
      "skills/5fedu-module-parity/references/index.md",
    ]));
    expect([...loadedSources].some(source => source.includes("/examples/"))).toBe(false);
    expect([...loadedSources].some(source => source.endsWith(".py"))).toBe(false);
    expect([...loadedSources].some(source => source.includes("/workflow/"))).toBe(false);
    const loadedTokens = [...loadedSources].reduce(
      (total, source) => total + Math.ceil(fs.readFileSync(path.join(root, source), "utf-8").length / 3.6),
      Math.ceil(fs.readFileSync(path.join(root, "profiles/5fedu/README.md"), "utf-8").length / 3.6),
    );
    expect(loadedTokens).toBeLessThanOrEqual(8000);
  });

  it("ignores cache, build, hidden, and binary artifacts deterministically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-ignored-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "rules"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "rules", "manifest.yaml"), "load_order:\n  - 00-test.md\n");
      fs.writeFileSync(path.join(tmpDir, "rules", "00-test.md"), "---\nrouting: {}\n---\n# Test rule\n");
      const refs = path.join(tmpDir, "skills", "unicode-skill", "references");
      fs.mkdirSync(path.join(refs, "nested", "Đường dẫn có khoảng trắng"), { recursive: true });
      fs.mkdirSync(path.join(refs, "__pycache__"), { recursive: true });
      fs.mkdirSync(path.join(refs, ".cache"), { recursive: true });
      fs.mkdirSync(path.join(refs, "build"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "skills", "unicode-skill", "SKILL.md"), "---\nrouting: {\"loads\":[]}\n---\n# Skill\n");
      fs.writeFileSync(path.join(refs, "nested", "Đường dẫn có khoảng trắng", "context.md"), "canonical text");
      fs.writeFileSync(path.join(refs, "__pycache__", "ignored.pyc"), Buffer.from([0, 1, 2]));
      fs.writeFileSync(path.join(refs, ".cache", "ignored.md"), "cache");
      fs.writeFileSync(path.join(refs, "build", "ignored.md"), "build");
      fs.writeFileSync(path.join(refs, "ignored.pyo"), Buffer.from([0, 1, 2]));
      fs.writeFileSync(path.join(refs, "ignored.png"), Buffer.from([0, 1, 2]));

      const first = buildContextGraph(tmpDir);
      const second = buildContextGraph(tmpDir);
      expect(first).toEqual(second);
      const sources = first.nodes.map(node => node.source);
      expect(sources).toContain("skills/unicode-skill/references/nested/Đường dẫn có khoảng trắng/context.md");
      expect(sources.some(source => /__pycache__|\.cache|\/build\/|\.py[co]$|\.png$/i.test(source))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails graph construction when a skill declares an unresolved load target", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-load-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "rules"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "rules", "manifest.yaml"), "load_order:\n  - 00-test.md\n");
      fs.writeFileSync(path.join(tmpDir, "rules", "00-test.md"), "---\nrouting: {}\n---\n# Test rule\n");
      fs.mkdirSync(path.join(tmpDir, "skills", "bad-skill"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "skills", "bad-skill", "SKILL.md"), "---\nrouting: {\"loads\":[\"missing-target\"]}\n---\n# Skill\n");
      expect(() => buildContextGraph(tmpDir)).toThrow("Skill skill:bad-skill has unresolved loads target: missing-target");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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
