import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGED_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const TEST_REPOSITORY_ROOT = process.env.AGENT_RULES_REPOSITORY_ROOT;
if (TEST_REPOSITORY_ROOT && process.env.NODE_ENV !== "test") {
  throw new Error("AGENT_RULES_REPOSITORY_ROOT is test-only and unavailable in production");
}

const REPO_ROOT = TEST_REPOSITORY_ROOT ? path.resolve(TEST_REPOSITORY_ROOT) : PACKAGED_ROOT;
const AUTOMATION_DIR = path.join(REPO_ROOT, "automation");

export function getRepoRoot(): string {
  return REPO_ROOT;
}

export function getAutomationDir(): string {
  return AUTOMATION_DIR;
}
