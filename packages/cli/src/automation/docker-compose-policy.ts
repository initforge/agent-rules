import fs from "node:fs/promises";
import path from "node:path";

interface ComposePolicyViolation {
  type: string;
  file: string;
  line: string;
  pattern: string;
  severity: string;
  message: string;
}

interface ComposeProjectStatus {
  status: string;
  projectPath: string;
  hasServiceProject: boolean;
  serviceCount: number;
  services: string[];
  violationCount: number;
  violations: ComposePolicyViolation[];
  scannedAt: string;
  verificationLevel: string;
}

export async function dockerComposePolicy(
  repoRoot: string,
  action: "check" | "enforce" | "status" | "list-violations" | "selftest" = "status"
): Promise<ComposeProjectStatus> {
  const violations: ComposePolicyViolation[] = [];
  const services: string[] = [];

  // Find docker-compose files
  const composeFiles = await findComposeFiles(repoRoot);

  for (const file of composeFiles) {
    try {
      const content = await fs.readFile(file, "utf8");
      const lines = content.split("\n");

      // Check for one-shot patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("restart: \"no\"") || line.includes("restart: 'no'")) {
          violations.push({
            type: "one-shot",
            file,
            line: String(i + 1),
            pattern: "restart: no",
            severity: "warning",
            message: "One-shot service detected (restart: no)",
          });
        }
      }

      // Extract service names
      let inServices = false;
      for (const line of lines) {
        if (/^services:/.test(line)) {
          inServices = true;
          continue;
        }
        if (inServices && /^  [a-zA-Z][\w-]*:/.test(line)) {
          const match = line.match(/^  ([a-zA-Z][\w-]*):/);
          if (match) {
            services.push(match[1]);
          }
        }
        if (inServices && /^(volumes|networks):/.test(line)) {
          inServices = false;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  const projectPath = composeFiles.length > 0 ? path.dirname(composeFiles[0]) : repoRoot;

  return {
    status: violations.length === 0 ? "pass" : "violations",
    projectPath,
    hasServiceProject: composeFiles.length > 0,
    serviceCount: services.length,
    services,
    violationCount: violations.length,
    violations,
    scannedAt: new Date().toISOString(),
    verificationLevel: action,
  };
}

async function findComposeFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && (entry.name === "docker-compose.yml" || entry.name === "docker-compose.yaml")) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}
