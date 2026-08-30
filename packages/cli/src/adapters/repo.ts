import path from "node:path";
import { resolvePackageRoot, resolveRuntimeAssetsRoot } from "../runtime/locator.js";

export function getRepoRoot(): string {
  return resolveRuntimeAssetsRoot();
}

export function getPackageRoot(): string {
  return resolvePackageRoot();
}

export function getAutomationDir(): string {
  return path.join(getRepoRoot(), "automation");
}
