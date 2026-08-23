import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bindReferencesToPrompt,
  deliverReferenceInputs,
  detectHostReferenceTransport,
} from "../../src/northstar/reference-input.js";
import { createWorkRequest } from "../../src/northstar/compiler.js";

const temps: string[] = [];
function tempDir(): string {
  const dir = path.join(os.tmpdir(), `multimodal-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("Multimodal Reference Input Delivery", () => {
  it("routes references to native_attachment for Claude and Antigravity IDE", () => {
    expect(detectHostReferenceTransport("claude")).toBe("native_attachment");
    expect(detectHostReferenceTransport("antigravity", "ide")).toBe("native_attachment");
    expect(detectHostReferenceTransport("antigravity", "cli")).toBe("workspace_materialized_reference");
    expect(detectHostReferenceTransport("codex")).toBe("workspace_materialized_reference");
    expect(detectHostReferenceTransport("opencode")).toBe("workspace_materialized_reference");
  });

  it("materializes reference files and calculates content SHA-256", async () => {
    const ws = tempDir();
    await fs.mkdir(ws, { recursive: true });
    const mockImage = path.join(ws, "mock_ui.png");
    await fs.writeFile(mockImage, "fake png content", "utf8");

    const req = createWorkRequest({
      raw_intent: "Implement design based on mock",
      reference_inputs: [mockImage],
    });

    const receipt = await deliverReferenceInputs(req, "claude", ws);
    expect(receipt.schema).toBe("harness/reference-delivery/v1");
    expect(receipt.items.length).toBe(1);
    expect(receipt.items[0].mime_type).toBe("image/png");
    expect(receipt.items[0].transport).toBe("native_attachment");
    expect(receipt.items[0].sha256).toBeDefined();

    const boundPrompt = bindReferencesToPrompt("Base prompt", receipt);
    expect(boundPrompt).toContain("Bound Reference Inputs (Multimodal Provenance)");
    expect(boundPrompt).toContain(mockImage);
  });
});
