import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = resolve(__dirname, "..", "..", "..");
const schema = JSON.parse(
  readFileSync(resolve(root, "schemas", "execution-contract.schema.json"), "utf8"),
);
const currentPointer = JSON.parse(
  readFileSync(resolve(root, ".agent", "current.json"), "utf8"),
);

const hash = "a".repeat(64);

function validator() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

function effectiveContract() {
  return {
    schema: "artifact/execution-contract",
    version: 1,
    kind: "effective-execution-contract",
    contract_id: "am22-contract-v1",
    plan_id: "plan-1",
    status: "PENDING_CANONICAL_ACTIVATION",
    original_sha256: hash,
    effective_plan_sha256: hash,
    source_chain: [
      {
        artifact_id: "ORIGINAL",
        path: ".agent/plans/plan-1/original.md",
        sha256: hash,
        status: "IMMUTABLE",
      },
    ],
    requirements: ["M11-R51"],
    capability_preservation: {
      default_disposition: "CARRIED",
      unimplemented_backlog: "REMAINS_EFFECTIVE",
      entries: [
        {
          concept: "existing backlog",
          source_requirement_ids: ["M11-R11"],
          disposition: "CARRIED",
          reason: "non-conflicting and still required",
        },
      ],
    },
    execution_policy: {
      strategy: "FRONTSTAGE_FIRST_CONTRACT_SAFE",
      main_role: "COORDINATOR_ONLY",
      normal_native_children: 8,
      burst_native_children: 10,
      child_target_scope: "LARGE_ACTIVE_RUN",
      normal_role_composition: {
        writers: 4,
        verifiers: 2,
        reviewers: 1,
        integration_preparation: 1,
      },
      burst_role_composition: {
        writers: 5,
        verifiers: 2,
        reviewers: 2,
        integration_preparation: 1,
      },
      adaptive_scale_down: true,
      speed_slo: {
        small_pair_no_regression: true,
        parallel_p50_reduction_min_percent: 70,
        parallel_p50_reduction_stretch_percent: 90,
        track_p95: true,
      },
      vitest_parent_limit_per_project: 2,
      vitest_parent_workers: 1,
      vitest_file_parallelism: false,
      vitest_full_suite_exclusive: true,
      baseline_hardware: {
        ram_gib: 16,
        cpu_class: "intel-core-i7-12700h-class",
        weaker_hosts_scale_down: true,
      },
      local_authority: {
        checkpoint: true,
        commit: true,
        local_merge: true,
        named_nonprod_dev_volume_reset: true,
        push: false,
        deploy: false,
        production_mutation: false,
      },
      cleanup_policy: "PRESERVATION_FIRST",
    },
  };
}

function reviewBundle() {
  return {
    schema: "artifact/execution-contract",
    version: 1,
    kind: "review-bundle",
    bundle_id: "review-1",
    plan_id: "plan-1",
    effective_plan_sha256: hash,
    candidate_epoch: hash,
    claim_scope: ["M11-R58"],
    plan_anchors: ["AM-0022#M11-R58"],
    diff_artifacts: [{ path: ".agent/evidence/diff.json", sha256: hash }],
    evidence_refs: [{ path: ".agent/evidence/test.json", sha256: hash }],
    open_findings: [],
    omitted_manifest: [],
    policy: {
      semantic_budget: "CLAIM_RELEVANT_ONLY",
      raw_logs_default: false,
      full_ledger_default: false,
      full_plan_default: false,
      targeted_drilldown: true,
      reviewer_read_only: true,
    },
  };
}

describe("execution contract schema", () => {
  it("validates the repository current pointer", () => {
    const validate = validator();
    expect(validate(currentPointer)).toBe(true);
  });

  it("requires capability preservation and the locked AM-0022 execution policy", () => {
    const validate = validator();
    expect(validate(effectiveContract())).toBe(true);

    const invalid = effectiveContract();
    invalid.capability_preservation.default_disposition = "DROP";
    invalid.execution_policy.burst_native_children = 14;
    expect(validate(invalid)).toBe(false);
  });

  it("requires compact read-only review bundles with targeted drill-down", () => {
    const validate = validator();
    expect(validate(reviewBundle())).toBe(true);

    const invalid = reviewBundle();
    invalid.policy.raw_logs_default = true;
    invalid.policy.reviewer_read_only = false;
    expect(validate(invalid)).toBe(false);
  });

  it("rejects stale or unsafe current-pointer forms", () => {
    const validate = validator();
    const invalid = structuredClone(currentPointer);
    invalid.generation = 0;
    invalid.plan_root = "P:\\agent-rules\\.agent\\plans";
    expect(validate(invalid)).toBe(false);
  });
});
