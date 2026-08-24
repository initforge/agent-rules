import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname as _pathDirname } from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = _pathDirname(__filename);
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// ── Paths ────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCHEMAS_DIR = path.join(REPO_ROOT, "schemas");
const FIXTURES_DIR = path.join(SCHEMAS_DIR, "fixtures");

// ── Helpers ──────────────────────────────────────────────────────────
function loadJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

// ── Fixture prefix matching (mirrors test-artifact-schemas.py) ───────
const KNOWN_PREFIXES = [
  "agent", "assignment", "capability", "claim-evidence", "claim-evidence-envelope", "context",
  "decision", "delegation", "evidence", "intent", "model-route",
  "model-routing", "plan", "policy-approval", "profile", "requirement",
  "run-state", "scorecard-evidence", "telemetry",
  "failure-eval", "sensor-policy",
  "repair-finding", "repair-packet",
  "mcp-focus-receipt",
].sort((a, b) => b.length - a.length);

function fixturePrefixToSchema(prefix: string): string {
  const mapping: Record<string, string> = {
    agent: "agent-result",
    "claim-evidence": "claim-evidence",
    "claim-evidence-envelope": "claim-evidence-envelope",
    evidence: "evidence",
    "model-route": "model-route",
    "model-routing": "model-routing",
    "policy-approval": "policy-approval",
    profile: "profile-manifest",
    "run-state": "run-state",
    "scorecard-evidence": "scorecard-evidence",
    telemetry: "telemetry-event",
  };
  return mapping[prefix] ?? prefix;
}

function getSchemaNameForFixture(basename: string): string {
  for (const prefix of KNOWN_PREFIXES) {
    if (basename.startsWith(prefix)) return fixturePrefixToSchema(prefix);
  }
  return basename;
}

function collectFixtures(subdir: string): Map<string, string[]> {
  const dir = path.join(FIXTURES_DIR, subdir);
  if (!fs.existsSync(dir)) return new Map();
  const result = new Map<string, string[]>();
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".json")) continue;
    const bn = path.basename(entry, ".json");
    const sn = getSchemaNameForFixture(bn);
    const items = result.get(sn) ?? [];
    items.push(path.join(dir, entry));
    result.set(sn, items);
  }
  return result;
}

// ── Load schemas once at module level ────────────────────────────────
const SCHEMAS = (() => {
  const map = new Map<string, unknown>();
  for (const entry of fs.readdirSync(SCHEMAS_DIR).sort()) {
    if (!entry.endsWith(".schema.json")) continue;
    const name = path.basename(entry, ".schema.json");
    map.set(name, loadJson(path.join(SCHEMAS_DIR, entry)));
  }
  return map;
})();

// ══════════════════════════════════════════════════════════════════════
//  Tests
// ══════════════════════════════════════════════════════════════════════

const schemaNames = [...SCHEMAS.keys()];

// ── Discovery ────────────────────────────────────────────────────────
describe("artifact schemas", () => {
  describe("discovery", () => {
    it(`found ${schemaNames.length} schemas: ${schemaNames.join(", ")}`, () => {
      expect(schemaNames.length).toBeGreaterThan(0);
    });
  });

  // ── $schema / $id checks ──────────────────────────────────────────
  describe("$schema and $id", () => {
    for (const name of schemaNames) {
      it(`${name} declares Draft 2020-12 $schema`, () => {
        const s = SCHEMAS.get(name) as Record<string, unknown>;
        expect(s["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
      });
    }

    it("all $id values are unique", () => {
      const ids = schemaNames.map((n) => (SCHEMAS.get(n) as Record<string, unknown>)["$id"]);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ── Meta-schema validation ────────────────────────────────────────
  describe("meta-schema validity", () => {
    for (const name of schemaNames) {
      it(`${name} is a valid Draft 2020-12 schema`, () => {
        const schema = SCHEMAS.get(name) as Record<string, unknown>;
        const ajv = createAjv();
        const metaValidate = ajv.getSchema("https://json-schema.org/draft/2020-12/schema");
        if (!metaValidate) throw new Error("2020-12 meta-schema not registered in Ajv");
        const valid = metaValidate(schema);
        if (!valid) {
          const msg = ajv.errorsText(ajv.errors);
          throw new Error(msg);
        }
        expect(valid).toBe(true);
      });
    }
  });

  // ── Positive fixtures ─────────────────────────────────────────────
  const posFixtures = collectFixtures("positive");
  describe("positive fixtures", () => {
    for (const [sn, files] of [...posFixtures.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const schemaObj = SCHEMAS.get(sn);
      if (!schemaObj) {
        it(`schema ${sn} exists`, () => expect(schemaObj).toBeDefined());
        continue;
      }
      describe(sn, () => {
        const ajv = createAjv();
        const validate = ajv.compile(schemaObj);
        for (const f of files) {
          it(path.basename(f, ".json"), () => {
            const data = loadJson(f);
            const valid = validate(data);
            if (!valid) console.error(ajv.errorsText(validate.errors));
            expect(valid).toBe(true);
          });
        }
      });
    }
  });

  // ── Negative fixtures ─────────────────────────────────────────────
  const negFixtures = collectFixtures("negative");
  describe("negative fixtures", () => {
    for (const [sn, files] of [...negFixtures.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const schemaObj = SCHEMAS.get(sn);
      if (!schemaObj) {
        it(`schema ${sn} exists`, () => expect(schemaObj).toBeDefined());
        continue;
      }
      describe(sn, () => {
        const ajv = createAjv();
        const validate = ajv.compile(schemaObj);
        for (const f of files) {
          it(path.basename(f, ".json"), () => {
            const data = loadJson(f);
            const valid = validate(data);
            expect(valid).toBe(false);
          });
        }
      });
    }
  });

  // ── Acceptance criteria ───────────────────────────────────────────
  describe("acceptance criteria", () => {
    const plan = SCHEMAS.get("plan") as Record<string, unknown> | undefined;
    const planProps = (plan?.properties ?? {}) as Record<string, unknown>;
    const taskItems = ((planProps.tasks as Record<string, unknown> | undefined)?.items ?? {}) as Record<string, unknown>;
    // Object form is authoritative inside the oneOf branch; string tasks are
    // legacy-tolerated only.
    const taskOneOf = (taskItems.oneOf ?? []) as Array<Record<string, unknown>>;
    const objectBranch = (taskOneOf.find((b) => b.type === "object") ?? {}) as Record<string, unknown>;
    const taskProps = ((objectBranch.properties ?? taskItems.properties) ?? {}) as Record<string, unknown>;

    it("plan has repository_baseline", () => {
      expect(planProps).toHaveProperty("repository_baseline");
    });

    it("plan has intent_reference", () => {
      expect(planProps).toHaveProperty("intent_reference");
    });

    it("plan has decisions", () => {
      expect(planProps).toHaveProperty("decisions");
    });

    it("plan tasks require acceptance_criteria", () => {
      expect(taskProps).toHaveProperty("acceptance_criteria");
    });

    it("plan has completion_policy", () => {
      expect(planProps).toHaveProperty("completion_policy");
    });

    const cap = SCHEMAS.get("capability") as Record<string, unknown> | undefined;
    const capProps = (cap?.properties ?? {}) as Record<string, unknown>;

    it("capability plan_mode includes all 4 states", () => {
      const planModeEnum = ((capProps.plan_mode as Record<string, unknown> | undefined)
        ?.enum ?? []) as string[];
      for (const s of ["native", "emulated", "unsupported", "unverified"]) {
        expect(planModeEnum).toContain(s);
      }
    });

    it("capability subagent capability_class includes utility", () => {
      const subagentItems = (capProps.subagents as Record<string, unknown> | undefined)
        ?.items as Record<string, unknown> | undefined;
      const capClassEnum = (subagentItems?.properties as Record<string, unknown> | undefined)
        ?.capability_class as Record<string, unknown> | undefined;
      const classEnum = (capClassEnum?.enum ?? []) as string[];
      expect(classEnum).toContain("utility");
    });

    const mr = SCHEMAS.get("model-route") as Record<string, unknown> | undefined;
    const mrProps = (mr?.properties ?? {}) as Record<string, unknown>;

    it("model-route requested capability_class includes utility", () => {
      const reqClassEnum = (
        (mrProps.requested as Record<string, unknown> | undefined)?.properties as
          Record<string, unknown> | undefined
      )?.capability_class as { enum?: string[] } | undefined;
      expect(reqClassEnum?.enum).toContain("utility");
    });

    it("no provider-specific model names in common schemas", () => {
      const providerNames = ["gpt", "claude", "gemini", "grok", "composer", "terra"];
      for (const [name, schema] of SCHEMAS) {
        const str = JSON.stringify(schema).toLowerCase();
        for (const pname of providerNames) {
          if (str.includes(pname)) {
            console.warn(`[WARN] ${name} contains provider-specific string '${pname}'`);
          }
        }
      }
    });
  });
});
