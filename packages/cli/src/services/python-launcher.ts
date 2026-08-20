import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const CONFIG_ENV = "AGENT_RULES_PYTHON";

function validatePython(execPath: string): boolean {
  try {
    const result = execFileSync(execPath, ["--version"], {
      encoding: "utf-8",
      timeout: 10000,
    });
    return result.trim().startsWith("Python 3");
  } catch {
    return false;
  }
}

export function resolvePython(): string | null {
  const explicit = process.env[CONFIG_ENV];
  if (explicit) {
    if (validatePython(explicit)) return explicit;
  }

  if (process.platform === "win32") {
    try {
      const result = execSync('py -3 -c "import sys; print(sys.executable)"', {
        encoding: "utf-8",
        timeout: 10000,
      });
      const py = result.trim();
      if (py && validatePython(py)) return py;
    } catch {
      // fall through
    }
  }

  try {
    const result = execSync("python3 -c \"import sys; print(sys.executable)\"", {
      encoding: "utf-8",
      timeout: 10000,
    });
    const py = result.trim();
    if (py && validatePython(py)) return py;
  } catch {
    // fall through
  }

  try {
    const result = execSync("python -c \"import sys; print(sys.executable)\"", {
      encoding: "utf-8",
      timeout: 10000,
    });
    const py = result.trim();
    if (py && validatePython(py)) return py;
  } catch {
    // fall through
  }

  return null;
}

export async function runPython(
  script: string,
  args: string[],
  root: string
): Promise<{ ok: boolean; skipped: boolean; output: string }> {
  const python = resolvePython();
  if (!python) {
    return {
      ok: false,
      skipped: true,
      output:
        "Python 3 not found. Set AGENT_RULES_PYTHON env var or install Python.",
    };
  }

  try {
    const result = execFileSync(python, [script, ...args], {
      cwd: root,
      encoding: "utf-8",
      timeout: 300000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, skipped: false, output: result };
  } catch (err: unknown) {
    const execErr = err as Record<string, unknown>;
    const stderr = typeof execErr.stderr === "string" ? execErr.stderr : "";
    const stdout = typeof execErr.stdout === "string" ? execErr.stdout : "";
    const msg =
      stderr || stdout || (err instanceof Error ? err.message : String(err));
    return { ok: false, skipped: false, output: msg };
  }
}

export async function runAllPythonTests(): Promise<void> {
  const root = process.cwd();
  const script = path.join(root, "automation", "run-python-tests.py");

  if (!fs.existsSync(script)) {
    console.error("MISSING: automation/run-python-tests.py");
    process.exit(1);
  }

  const { ok, skipped, output } = await runPython(script, [], root);

  if (skipped) {
    console.log("Python 3 not available — skipping Python tests.");
    process.exit(0);
  }

  process.stdout.write(output);
  if (!ok) {
    process.exit(1);
  }
}
