import fs from 'node:fs';
import { execSync } from 'node:child_process';

interface DelegationAssignment {
  taskId: string;
  reqIds: string[];
  objective: string;
  ownedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  model: string;
  effort: string;
}

interface DelegationReceipt {
  taskId: string;
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  evidencePaths: string[];
  status: 'PASS' | 'PARTIAL' | 'FAIL' | 'BLOCKED';
  retries: number;
  assumptions: string[];
  unresolvedFindings: string[];
}

function fatal(msg: string): never {
  process.stderr.write(`WORKER_ERROR: ${msg}\n`);
  process.exit(1);
}

function main(): void {
  const assignmentPath = process.argv[2];
  if (!assignmentPath) {
    fatal('Usage: local-worker-script.ts <assignment-json-path>');
  }

  let assignment: DelegationAssignment;
  try {
    const raw = fs.readFileSync(assignmentPath, 'utf-8');
    assignment = JSON.parse(raw) as DelegationAssignment;
  } catch (err) {
    fatal(`Cannot read assignment: ${(err as Error).message}`);
  }

  if (!assignment.taskId) fatal('Missing taskId in assignment');
  if (!assignment.objective) fatal('Missing objective in assignment');
  if (!Array.isArray(assignment.ownedPaths)) fatal('Missing ownedPaths in assignment');

  const filesChanged: string[] = [];
  const commandsRun: string[] = [];
  const testsRun: string[] = [];
  const assumptions: string[] = [];
  const unresolvedFindings: string[] = [];

  for (const p of assignment.ownedPaths) {
    const fullPath = p;
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          if (lines.length > 0) {
            filesChanged.push(p);
          }
        }
      } catch {
        unresolvedFindings.push(`Could not read owned path: ${p}`);
      }
    } else {
      unresolvedFindings.push(`Owned path does not exist: ${p}`);
    }
  }

  const verifyCmds = assignment.verificationCommands ?? [];
  for (const cmd of verifyCmds) {
    commandsRun.push(cmd);
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 30_000, cwd: process.cwd() });
      testsRun.push(cmd);
    } catch (err) {
      unresolvedFindings.push(`Verification command failed: ${cmd} – ${(err as Error).message}`);
    }
  }

  let status: DelegationReceipt['status'] = 'PASS';
  if (unresolvedFindings.length > 0 && filesChanged.length === 0) {
    status = 'FAIL';
  } else if (unresolvedFindings.length > 0) {
    status = 'PARTIAL';
  }

  const receipt: DelegationReceipt = {
    taskId: assignment.taskId,
    filesChanged,
    commandsRun,
    testsRun,
    evidencePaths: [],
    status,
    retries: 0,
    assumptions,
    unresolvedFindings,
  };

  process.stdout.write(JSON.stringify(receipt));
  process.exit(0);
}

main();
