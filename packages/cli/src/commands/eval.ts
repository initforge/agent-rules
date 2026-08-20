import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface EvalSuite {
  id: string;
  description: string;
  script: string;
  args: string[];
  live: boolean;
}

const SUITES: EvalSuite[] = [
  {
    id: "agent-quality",
    description: "Evidence-first agent quality benchmark and conformance suite",
    script: "automation/test-agent-quality-benchmark.py",
    args: [],
    live: false,
  },
  {
    id: "live-adapter",
    description: "Live/headless adapter contracts (contract-safe by default)",
    script: "automation/test-live-agent-adapter.py",
    args: ["--contracts-only"],
    live: false,
  },
  {
    id: "context-router",
    description: "Context routing conformance corpus",
    script: "automation/test-context-router.py",
    args: [],
    live: false,
  },
  {
    id: "live-benchmark",
    description: "Real live benchmark runner; requires an available configured agent/model",
    script: "automation/run-live-benchmark.py",
    args: [],
    live: true,
  },
];

function resolvePython(): string | null {
  for (const candidate of [process.env.PYTHON, "python3", "python"].filter((value): value is string => Boolean(value))) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", stdio: "pipe", timeout: 15_000 });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function suiteById(id: string): EvalSuite | undefined {
  return SUITES.find((suite) => suite.id === id);
}

function tail(value: string, max = 12000): string {
  return value.length <= max ? value : value.slice(value.length - max);
}

/**
 * Eval command backed by the canonical Python evaluation corpus.
 * Suite ids are whitelisted and mapped to argv arrays; user input is never
 * interpolated into a shell command.
 */
export async function evalCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const subcommand = args[0] || "list";
  const root = getRepoRoot();

  if (subcommand === "list") {
    if (!options.json) {
      console.log("Available benchmark suites:");
      for (const suite of SUITES) console.log(`  ${suite.id.padEnd(16)} — ${suite.description}`);
    }
    return {
      exitCode: ExitCode.Success,
      message: `${SUITES.length} evaluation suite(s) available`,
      data: { suites: SUITES.map(({ id, description, live }) => ({ id, description, live })) },
    };
  }

  if (subcommand === "run") {
    const suiteId = args[1] || "agent-quality";
    const suite = suiteById(suiteId);
    if (!suite) {
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown eval suite: ${suiteId}. Use: ${SUITES.map((item) => item.id).join(", ")}`,
      };
    }
    if (options.dryRun) {
      return {
        exitCode: ExitCode.Success,
        message: `Dry-run: would execute ${suite.id}`,
        data: { suite: suite.id, script: suite.script, args: suite.args },
      };
    }
    const python = resolvePython();
    if (!python) {
      return {
        exitCode: ExitCode.GeneralError,
        message: "Python is required for the canonical evaluation corpus",
        data: { suite: suite.id, status: "BLOCKED", reason: "python-unavailable" },
      };
    }
    const script = path.join(root, suite.script);
    if (!fs.existsSync(script)) {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Evaluation suite source is missing: ${suite.script}`,
        data: { suite: suite.id, status: "BLOCKED", reason: "suite-source-missing" },
      };
    }
    const started = Date.now();
    const result = spawnSync(python, [script, ...suite.args], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      timeout: suite.live ? 15 * 60_000 : 5 * 60_000,
      env: process.env,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    if (!options.json) {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    }
    if (result.error || result.status !== 0) {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Evaluation suite ${suite.id} failed`,
        data: {
          suite: suite.id,
          status: result.error ? "BLOCKED" : "FAILED",
          exitCode: result.status,
          error: result.error?.message,
          durationMs: Date.now() - started,
          stdout: tail(stdout),
          stderr: tail(stderr),
        },
      };
    }
    return {
      exitCode: ExitCode.Success,
      message: `Evaluation suite ${suite.id} passed`,
      data: { suite: suite.id, status: "PASS", durationMs: Date.now() - started, stdout: tail(stdout), stderr: tail(stderr) },
    };
  }

  if (subcommand === "results") {
    const candidates = [
      path.join(root, ".agent", "tmp", "benchmarks", "results", "live-results.jsonl"),
      path.join(root, "evals", "outcomes"),
    ];
    const liveFile = candidates[0];
    let liveCount = 0;
    if (fs.existsSync(liveFile)) {
      liveCount = fs.readFileSync(liveFile, "utf8").split(/\r?\n/).filter(Boolean).length;
    }
    const outcomeFiles = fs.existsSync(candidates[1])
      ? fs.readdirSync(candidates[1]).filter((name) => /\.(?:md|json|jsonl)$/i.test(name)).sort()
      : [];
    if (!options.json) {
      console.log(`Live benchmark records: ${liveCount}`);
      console.log(`Outcome artifacts: ${outcomeFiles.length}`);
      for (const name of outcomeFiles.slice(-10)) console.log(`  ${name}`);
    }
    return {
      exitCode: ExitCode.Success,
      message: `${liveCount} live record(s), ${outcomeFiles.length} outcome artifact(s)`,
      data: { liveRecords: liveCount, outcomeArtifacts: outcomeFiles },
    };
  }

  return {
    exitCode: ExitCode.InvalidArgument,
    message: `Unknown eval subcommand: ${subcommand}. Use: list, run [suite], results`,
  };
}
