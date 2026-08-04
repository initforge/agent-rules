/**
 * Helper for running local-worker-script.ts directly in tests.
 * Spawns the script via node + tsx (same as LocalWorkerAdapter) and
 * returns the raw stdout/stderr/exitCode for assertion.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function resolveTsxBin(): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, 'node_modules', 'tsx');
    try {
      const pkgPath = path.join(candidate, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.bin) {
        const binName = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0] as string;
        return path.join(candidate, binName);
      }
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'tsx';
}

export function runScriptWithCommand(cmd: string, root?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-test-'));
  const assignmentPath = path.join(tmpDir, 'assignment.json');
  const scriptPath = path.join(process.cwd(), 'src', 'adapters', 'local-worker-script.ts');
  const tsxBin = resolveTsxBin();

  const assignment = {
    taskId: 'SCRIPT-TEST',
    reqIds: ['REQ-SCRIPT'],
    objective: 'Script test',
    ownedPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verificationCommands: [cmd],
    model: 'test',
    effort: 'small',
    root: root ?? tmpDir,
  };
  fs.writeFileSync(assignmentPath, JSON.stringify(assignment));

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxBin, scriptPath, assignmentPath], {
      cwd: tmpDir,
      timeout: 10_000,
      env: { ...process.env, PATH: process.env.PATH },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', (code) => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
    child.on('error', (err) => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      resolve({ exitCode: 1, stdout: '', stderr: err.message });
    });
  });
}
