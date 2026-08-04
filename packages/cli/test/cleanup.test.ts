import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertExactNamed,
  buildReceipt,
  classifyPath,
  deletePaths,
  inventoryPaths,
  rescuePaths,
} from "../src/cleanup/index.js";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "b05-cleanup-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.ts"), "export {};\n");
  fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.js"), "x");
  fs.writeFileSync(path.join(root, "junk.log"), "log line\n");
  fs.writeFileSync(path.join(root, "build.tmp"), "tmp data");
  fs.writeFileSync(path.join(root, "README.md"), "# root\n");
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("B05 classify (inventory)", () => {
  it("classifies junk by extension and basename as delete", () => {
    const root = makeRoot();
    expect(classifyPath(path.join(root, "junk.log"), root).classification).toBe("delete");
    expect(classifyPath(path.join(root, "build.tmp"), root).classification).toBe("delete");
    fs.mkdirSync(path.join(root, "__pycache__"));
    expect(classifyPath(path.join(root, "__pycache__"), root).classification).toBe("delete");
  });

  it("classifies protected segments as keep (fail closed)", () => {
    const root = makeRoot();
    expect(classifyPath(root, root).classification).toBe("keep");
    expect(classifyPath(path.join(root, "src", "app.ts"), root).classification).toBe("keep");
    expect(classifyPath(path.join(root, ".git"), root).classification).toBe("keep");
    expect(classifyPath(path.join(root, "node_modules", "pkg"), root).classification).toBe("keep");
    expect(classifyPath(path.join(root, "generated"), root).classification).toBe("keep");
    expect(classifyPath(path.join(root, ".agent"), root).classification).toBe("keep");
  });

  it("classifies unclassified content as rescue (preserve before removal)", () => {
    const root = makeRoot();
    const item = classifyPath(path.join(root, "README.md"), root);
    expect(item.classification).toBe("rescue");
    expect(item.reason).toContain("preserve");
  });

  it("classifies outside-root and missing paths as keep", () => {
    const root = makeRoot();
    const outside = path.join(path.dirname(root), "elsewhere.txt");
    expect(classifyPath(outside, root).classification).toBe("keep");
    expect(classifyPath(path.join(root, "nope.missing"), root).classification).toBe("keep");
    expect(classifyPath(path.join(root, "nope.missing"), root).reason).toContain("does not exist");
  });

  it("inventories a mixed set deterministically", () => {
    const root = makeRoot();
    const items = inventoryPaths(
      [path.join(root, "junk.log"), path.join(root, "README.md"), path.join(root, "src")],
      root
    );
    expect(items.map((item) => item.classification)).toEqual(["delete", "rescue", "keep"]);
  });
});

describe("B05 exact-named non-prod deletion guard", () => {
  it("rejects glob patterns", () => {
    expect(() => assertExactNamed("*.log")).toThrow(/exact/);
    expect(() => assertExactNamed("foo?bar")).toThrow(/exact/);
    expect(() => assertExactNamed(path.join("a", "[b]", "c"))).toThrow(/exact/);
  });

  it("delete refuses protected and rescue-classified targets", () => {
    const root = makeRoot();
    expect(() =>
      deletePaths([path.join(root, "src", "app.ts")], { repoRoot: root, receiptsDir: path.join(root, ".r"), dryRun: false })
    ).toThrow(/Deletion guard/);
    expect(() =>
      deletePaths([path.join(root, "README.md")], { repoRoot: root, receiptsDir: path.join(root, ".r"), dryRun: false })
    ).toThrow(/classified rescue/);
  });

  it("delete refuses missing and outside-root paths", () => {
    const root = makeRoot();
    expect(() =>
      deletePaths([path.join(root, "missing.log")], { repoRoot: root, receiptsDir: path.join(root, ".r"), dryRun: false })
    ).toThrow(/missing/);
    const outside = path.join(path.dirname(root), "x.log");
    fs.writeFileSync(outside, "x");
    expect(() =>
      deletePaths([outside], { repoRoot: root, receiptsDir: path.join(root, ".r"), dryRun: false })
    ).toThrow(/Deletion guard/);
  });
});

describe("B05 delete + irreversibility receipt", () => {
  it("dry-run deletes nothing and writes no receipt", () => {
    const root = makeRoot();
    const target = path.join(root, "junk.log");
    const receiptsDir = path.join(root, "receipts");
    const receipt = deletePaths([target], { repoRoot: root, receiptsDir, dryRun: true });
    expect(fs.existsSync(target)).toBe(true);
    expect(receipt.dryRun).toBe(true);
    expect(receipt.irreversible).toBe(true);
    expect(fs.existsSync(path.join(receiptsDir, `${receipt.receiptId}.json`))).toBe(false);
  });

  it("deletes only the exact junk file, emits irreversibility receipt with rollback", () => {
    const root = makeRoot();
    const target = path.join(root, "junk.log");
    const receiptsDir = path.join(root, "receipts");
    const receipt = deletePaths([target], { repoRoot: root, receiptsDir, dryRun: false });
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(path.join(root, "README.md"))).toBe(true);
    expect(receipt.mode).toBe("delete");
    expect(receipt.irreversible).toBe(true);
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0].rel).toBe("junk.log");
    expect(receipt.rollback.some((line) => line.includes("irreversible"))).toBe(true);
    expect(receipt.rollback.some((line) => line.includes("git restore"))).toBe(true);
    const stored = JSON.parse(fs.readFileSync(path.join(receiptsDir, `${receipt.receiptId}.json`), "utf8"));
    expect(stored.receiptId).toBe(receipt.receiptId);
  });

  it("deletes a whole junk directory recursively", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "__pycache__"), { recursive: true });
    fs.writeFileSync(path.join(root, "__pycache__", "x.pyc"), "x");
    const receipt = deletePaths([path.join(root, "__pycache__")], {
      repoRoot: root,
      receiptsDir: path.join(root, "receipts"),
      dryRun: false,
    });
    expect(fs.existsSync(path.join(root, "__pycache__"))).toBe(false);
    expect(receipt.items[0].kind).toBe("directory");
  });
});

describe("B05 rescue + rollback receipt", () => {
  it("moves items to quarantine and rollback restores them", () => {
    const root = makeRoot();
    const quarantineRoot = path.join(root, "quarantine");
    const receipt = rescuePaths([path.join(root, "junk.log"), path.join(root, "README.md")], {
      repoRoot: root,
      quarantineRoot,
      dryRun: false,
    });
    expect(receipt.irreversible).toBe(false);
    expect(receipt.quarantineDir).not.toBeNull();
    expect(fs.existsSync(path.join(root, "junk.log"))).toBe(false);
    expect(fs.existsSync(path.join(root, "README.md"))).toBe(false);
    expect(fs.existsSync(path.join(receipt.quarantineDir!, "items", "junk.log"))).toBe(true);
    expect(fs.existsSync(path.join(receipt.quarantineDir!, "items", "README.md"))).toBe(true);
    expect(receipt.rollback.some((line) => line.includes("move each item"))).toBe(true);
    // Rollback: move back
    fs.renameSync(path.join(receipt.quarantineDir!, "items", "README.md"), path.join(root, "README.md"));
    expect(fs.readFileSync(path.join(root, "README.md"), "utf8")).toBe("# root\n");
  });

  it("refuses to rescue protected paths", () => {
    const root = makeRoot();
    expect(() =>
      rescuePaths([path.join(root, "src", "app.ts")], {
        repoRoot: root,
        quarantineRoot: path.join(root, "q"),
        dryRun: false,
      })
    ).toThrow(/Rescue guard/);
  });
});

describe("B05 receipt integrity", () => {
  it("hash is sha256 of the canonical receipt body", () => {
    const root = makeRoot();
    const receipt = buildReceipt({
      mode: "delete",
      repoRoot: root,
      items: inventoryPaths([path.join(root, "junk.log")], root),
      dryRun: false,
      irreversible: true,
      quarantineDir: null,
      gitHead: null,
    });
    const recomputed = crypto
      .createHash("sha256")
      .update(JSON.stringify({ ...receipt, hash: undefined }))
      .digest("hex");
    expect(receipt.hash).toBe(recomputed);
    expect(receipt.schema).toBe("artifact/cleanup-receipt");
    expect(receipt.version).toBe(1);
  });
});
