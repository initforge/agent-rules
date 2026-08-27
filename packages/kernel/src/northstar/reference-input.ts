import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { WorkRequest } from "./protocol.js";

export type ReferenceInputTransport =
  | "native_attachment"
  | "workspace_materialized_reference"
  | "unsupported";

export interface ReferenceDeliveryItem {
  uri: string;
  sha256: string;
  mime_type?: string;
  transport: ReferenceInputTransport;
  size_bytes?: number;
  materialized_path?: string;
}

export interface NativeReferenceDeliveryReceipt {
  schema: "harness/reference-delivery/v1";
  version: 1;
  delivery_id: string;
  work_id: string;
  host: string;
  items: ReferenceDeliveryItem[];
  delivered_at: string;
  observed_by_planner: boolean;
}

export function detectHostReferenceTransport(host: string, surface?: "ide" | "cli"): ReferenceInputTransport {
  switch (host) {
    case "claude":
      return "native_attachment";
    case "antigravity":
      return surface === "cli" ? "workspace_materialized_reference" : "native_attachment";
    case "codex":
    case "opencode":
    case "cursor":
    case "grok":
    case "command-code":
    case "deepseek-harness":
    case "omp":
      return "workspace_materialized_reference";
    default:
      return "workspace_materialized_reference";
  }
}

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".svg": return "image/svg+xml";
    case ".pdf": return "application/pdf";
    case ".json": return "application/json";
    case ".txt": return "text/plain";
    case ".md": return "text/markdown";
    default: return "application/octet-stream";
  }
}

export async function deliverReferenceInputs(
  request: WorkRequest,
  host: string,
  workspaceRoot: string,
  surface?: "ide" | "cli"
): Promise<NativeReferenceDeliveryReceipt> {
  const transport = detectHostReferenceTransport(host, surface);
  const items: ReferenceDeliveryItem[] = [];

  const refs = request.reference_inputs ?? [];
  for (const ref of refs) {
    let sha = "";
    let size: number | undefined;
    let materialized: string | undefined;

    const resolvedPath = path.isAbsolute(ref) ? ref : path.join(workspaceRoot, ref);
    try {
      const stat = await fs.stat(resolvedPath);
      if (stat.isFile()) {
        const buffer = await fs.readFile(resolvedPath);
        sha = crypto.createHash("sha256").update(buffer).digest("hex");
        size = stat.size;
        materialized = resolvedPath;
      }
    } catch {
      sha = crypto.createHash("sha256").update(ref, "utf8").digest("hex");
    }

    items.push({
      uri: ref,
      sha256: sha || crypto.createHash("sha256").update(ref, "utf8").digest("hex"),
      mime_type: detectMimeType(ref),
      transport,
      size_bytes: size,
      materialized_path: materialized,
    });
  }

  return {
    schema: "harness/reference-delivery/v1",
    version: 1,
    delivery_id: `ref-del-${Date.now()}`,
    work_id: request.work_id,
    host,
    items,
    delivered_at: new Date().toISOString(),
    observed_by_planner: items.length > 0,
  };
}

export function bindReferencesToPrompt(
  prompt: string,
  receipt: NativeReferenceDeliveryReceipt
): string {
  if (!receipt.items || receipt.items.length === 0) return prompt;

  const header = "\n\n### Bound Reference Inputs (Multimodal Provenance):\n";
  const lines = receipt.items.map((item) => {
    const pathPart = item.materialized_path ? `, Path: ${item.materialized_path}` : "";
    return `- [Reference] ${item.uri} (SHA-256: ${item.sha256}, Transport: ${item.transport}, MIME: ${item.mime_type || "unknown"}${pathPart})`;
  });

  return prompt + header + lines.join("\n") + "\n";
}
