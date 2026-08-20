import { describe, it, expect, afterAll, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import {
  commitCurrentPointer,
  readCurrentPointer,
  PointerCasError,
  POINTER_FILE,
  STAGE_PREFIX,
  STALE_STAGE_MS,
  type CurrentPointer,
} from "../src/services/current-pointer.js";
import { SYMLINK_CAPABLE } from "./helpers/symlink-capability.js";

const tmpRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-cas-"));
  fs.mkdirSync(path.join(root, ".agent", "plans", "p1", "amendments"), { recursive: true });
  fs.mkdirSync(path.join(root, ".agent", "plans", "p1", "generations", "1"), { recursive: true });
  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agent", "plans", "p1", "original.md"), "original v1\n");
  fs.writeFileSync(path.join(root, ".agent", "plans", "p1", "amendments", "am-0022.md"), "amendment v1\n");
  fs.writeFileSync(path.join(root, ".agent", "ledger.json"), "ledger v1\n");
  fs.writeFileSync(
    path.join(root, ".agent", "plans", "p1", "generations", "1", "effective-contract.json"),
    "contract v1\n",
  );
  fs.writeFileSync(path.join(root, "schemas", "execution-contract.schema.json"), "{}");
  tmpRoots.push(root);
  return root;
}

function h(relPath: string, root: string): string {
  return createHash("sha256").update(fs.readFileSync(path.join(root, relPath))).digest("hex");
}

function candidate(root: string, gen: number, expectedPrev: number, overrides: Record<string, any> = {}): CurrentPointer {
  const originalPath = ".agent/plans/p1/original.md";
  const amendmentPath = ".agent/plans/p1/amendments/am-0022.md";
  const ledgerPath = ".agent/ledger.json";
  const contractPath = ".agent/plans/p1/generations/1/effective-contract.json";
  const base: CurrentPointer = {
    schema: "artifact/execution-contract",
    version: 1,
    kind: "current-pointer",
    generation: gen,
    work_id: "p1",
    plan_id: "p1",
    plan_root: ".agent/plans/p1",
    original: { path: originalPath, sha256: h(originalPath, root) },
    canonical_ledger: {
      path: ledgerPath,
      sha256: h(ledgerPath, root),
      observed_revision: 1,
      observed_effective_sha256: "b".repeat(64),
      plan_status: "ADOPTED",
      execution_state: "RUNNING",
    },
    effective_chain_tip: { amendment_id: "AM-0022", path: amendmentPath, sha256: h(amendmentPath, root) },
    candidate_chain_tip: {
      amendment_id: "AM-0022",
      status: "OWNER_APPROVED_EFFECTIVE",
      path: amendmentPath,
      sha256: h(amendmentPath, root),
    },
    contract: {
      path: contractPath,
      sha256: h(contractPath, root),
      schema_path: "schemas/execution-contract.schema.json",
      requirement_ids: ["M11-R63"],
      status: "EFFECTIVE",
    },
    atomicity: {
      protocol: "generation-compare-and-swap",
      expected_previous_generation: expectedPrev,
      commit_target: POINTER_FILE,
      activation_state: "CANONICALLY_ACTIVATED",
      updated_at: new Date().toISOString(),
    },
  };
  const merged: any = { ...base, ...overrides };
  for (const key of ["original", "canonical_ledger", "effective_chain_tip", "candidate_chain_tip", "contract", "atomicity"]) {
    if (overrides[key]) merged[key] = { ...(base as any)[key], ...overrides[key] };
  }
  return merged as CurrentPointer;
}

function seedPointer(root: string, gen: number, expectedPrev: number): string {
  const content = JSON.stringify(candidate(root, gen, expectedPrev), null, 2) + "\n";
  fs.writeFileSync(path.join(root, POINTER_FILE), content);
  return content;
}

function pointerBytes(root: string): Buffer {
  return fs.readFileSync(path.join(root, POINTER_FILE));
}

function stageFiles(root: string): string[] {
  return fs.readdirSync(path.join(root, ".agent")).filter((n) => n.startsWith(STAGE_PREFIX));
}

function casCode(e: unknown): string {
  expect(e).toBeInstanceOf(PointerCasError);
  return (e as PointerCasError).code;
}

afterAll(() => {
  for (const r of tmpRoots) fs.rmSync(r, { recursive: true, force: true });
});

describe("commitCurrentPointer — atomic generation CAS", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
  });

  it("advances generation atomically and reopen-verifies the committed pointer", () => {
    const before = seedPointer(root, 1, 0);
    expect(before).toBeTruthy();

    const next = candidate(root, 2, 1);
    const receipt = commitCurrentPointer(root, next, 1);

    expect(receipt.generation).toBe(2);
    expect(receipt.commit_target).toBe(POINTER_FILE);
    expect(receipt.reopened).toBe(true);
    expect(receipt.staged_sha256).toBe(receipt.verified_sha256);

    const committed = pointerBytes(root);
    expect(createHash("sha256").update(committed).digest("hex")).toBe(receipt.verified_sha256);
    expect(committed.toString("utf-8")).toBe(JSON.stringify(next, null, 2) + "\n");
    expect(readCurrentPointer(root)!.generation).toBe(2);
    expect(stageFiles(root)).toEqual([]);
  });

  it("fails closed on a stale expected generation and leaves the pointer untouched", () => {
    const before = pointerBytes(root);
    expect(readCurrentPointer(root)!.generation).toBe(2);

    const stale = candidate(root, 4, 3); // current is 2, not 3
    expect(() => commitCurrentPointer(root, stale, 3)).toThrowError(/expected generation 3 but current pointer is generation 2/);

    expect(pointerBytes(root)).toEqual(before);
    expect(stageFiles(root)).toEqual([]);
  });

  it("rejects a second writer targeting the same next generation (exclusive stage)", () => {
    const before = pointerBytes(root);
    // Another writer already owns the stage for generation 3.
    fs.writeFileSync(path.join(root, ".agent", `${STAGE_PREFIX}3`), "other writer\n");

    const next = candidate(root, 3, 2);
    const err = (() => {
      try {
        commitCurrentPointer(root, next, 2);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(casCode(err)).toBe("POINTER_LOCKED_STAGE");
    expect(pointerBytes(root)).toEqual(before);
    // The other writer's stage is untouched (not swept, still fresh).
    expect(stageFiles(root)).toEqual([`${STAGE_PREFIX}3`]);
  });

  it("sweeps a stale crashed-writer stage and commits", () => {
    const stale = path.join(root, ".agent", `${STAGE_PREFIX}3`);
    const past = new Date(Date.now() - STALE_STAGE_MS - 5_000);
    fs.utimesSync(stale, past, past);

    const next = candidate(root, 3, 2);
    const receipt = commitCurrentPointer(root, next, 2);
    expect(receipt.generation).toBe(3);
    expect(readCurrentPointer(root)!.generation).toBe(3);
    expect(stageFiles(root)).toEqual([]);
  });
});

describe("candidate validation", () => {
  // Each case gets a fresh root seeded at generation 1; candidate is built
  // BEFORE the filesystem is mutated so its recorded hashes stay stale/valid
  // as intended.
  function seededRoot(): string {
    const root = makeRoot();
    seedPointer(root, 1, 0);
    return root;
  }

  it("rejects an absolute path", () => {
    const root = seededRoot();
    const bad = candidate(root, 2, 1, { original: { path: "C:\\evil\\outside.md" } });
    const err = (() => {
      try {
        commitCurrentPointer(root, bad, 1);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(casCode(err)).toBe("POINTER_PATH_UNSAFE");
  });

  it("rejects a traversing path", () => {
    const root = seededRoot();
    const bad = candidate(root, 2, 1, { plan_root: ".agent/plans/../.." });
    expect(() => commitCurrentPointer(root, bad, 1)).toThrowError(/traversing path/);
  });

  it("rejects a missing referenced target", () => {
    const root = seededRoot();
    const bad = candidate(root, 2, 1); // hashes recorded while file exists
    fs.rmSync(path.join(root, ".agent", "plans", "p1", "amendments", "am-0022.md"));
    const err = (() => {
      try {
        commitCurrentPointer(root, bad, 1);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(casCode(err)).toBe("POINTER_REFERENCED_TARGET_MISSING");
  });

  it("rejects a referenced hash mismatch", () => {
    const root = seededRoot();
    const bad = candidate(root, 2, 1); // records the v1 hash
    fs.writeFileSync(path.join(root, ".agent", "plans", "p1", "amendments", "am-0022.md"), "amendment v2\n");
    const err = (() => {
      try {
        commitCurrentPointer(root, bad, 1);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(casCode(err)).toBe("POINTER_REFERENCED_HASH_MISMATCH");
  });

  it("rejects wrong generation arithmetic", () => {
    const root = seededRoot();
    const bad = candidate(root, 3, 1); // expected 1 => next generation must be 2
    const err = (() => {
      try {
        commitCurrentPointer(root, bad, 1);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(casCode(err)).toBe("POINTER_INVALID_CANDIDATE");
  });

  it("rejects a non-CAS atomicity protocol", () => {
    const root = seededRoot();
    const bad = candidate(root, 2, 1, { atomicity: { protocol: "plain-rename" } });
    expect(() => commitCurrentPointer(root, bad, 1)).toThrowError(/generation-compare-and-swap/);
  });
});

describe("bootstrap", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
  });

  it("commits the first pointer when expected generation is 0", () => {
    expect(readCurrentPointer(root)).toBeNull();
    const receipt = commitCurrentPointer(root, candidate(root, 1, 0), 0);
    expect(receipt.generation).toBe(1);
    expect(readCurrentPointer(root)!.generation).toBe(1);
  });

  it("fails closed when a pointer already exists", () => {
    const err = (() => {
      try {
        commitCurrentPointer(root, candidate(root, 2, 1), 0);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(casCode(err)).toBe("POINTER_STALE_EXPECTED");
  });
});

describe("readCurrentPointer", () => {
  it("returns null when the pointer is absent", () => {
    expect(readCurrentPointer(makeRoot())).toBeNull();
  });

  it("rejects a corrupt pointer file", () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, POINTER_FILE), "not-json{");
    expect(() => readCurrentPointer(root)).toThrowError(/not valid JSON/);
  });

  it("rejects a pointer that omits the explicit work owner binding", () => {
    const root = makeRoot();
    const pointer = candidate(root, 1, 0) as any;
    delete pointer.work_id;
    fs.writeFileSync(path.join(root, POINTER_FILE), JSON.stringify(pointer) + "\n");
    expect(() => readCurrentPointer(root)).toThrowError(/requires a non-empty work_id/);
  });
});

describe("symlink safety", () => {
  it("rejects a symlinked commit target", () => {
    if (!SYMLINK_CAPABLE) return;
    const root = makeRoot();
    const real = path.join(root, ".agent", "current.json");
    fs.writeFileSync(real, JSON.stringify(candidate(root, 1, 0), null, 2) + "\n");
    const link = path.join(root, ".agent", "current-link.json");
    fs.symlinkSync(real, link);
    // Point the commit target through a symlink.
    const target = path.join(root, POINTER_FILE);
    fs.renameSync(real, link);
    fs.symlinkSync("current-link.json", target);

    const err = (() => {
      try {
        commitCurrentPointer(root, candidate(root, 2, 1), 1);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(casCode(err)).toBe("POINTER_PATH_UNSAFE");
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true); // untouched
  });
});
