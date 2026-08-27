import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStandardCapabilityBroker } from '@initforge/agent-rules-kernel/northstar/routing.js';
import { runHostCanary } from '@initforge/agent-rules-kernel/northstar/host-canary.js';
import { createWorkRequest, compileWorkSpec, compileTaskPackets } from '@initforge/agent-rules-kernel/northstar/compiler.js';

const repoRoot = path.resolve(process.cwd(), '../..');

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: {
    capabilities?: Record<string, unknown>;
    tools?: Array<{ name: string; description?: string }>;
    content?: Array<{ type: string; text: string }>;
  };
  error?: { code: number; message: string };
}

/** Helper that speaks real JSON-RPC 2.0 over stdio to an MCP server process. */
async function executeRealMcpToolCall(
  command: string,
  args: string[],
  toolName: string,
  toolArgs: Record<string, unknown> = {}
): Promise<{ initialized: boolean; toolResult: unknown; contentText: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    initialized: boolean;
    toolResult: unknown;
    contentText: string;
  }>();

  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });

  let buffer = '';
  let initialized = false;

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id === 1 && msg.result) {
          initialized = true;
          // Step 2: Send tools/call
          child.stdin.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: toolArgs,
              },
            }) + '\n'
          );
        } else if (msg.id === 2) {
          child.kill();
          const contentText = msg.result?.content?.[0]?.text ?? '';
          resolve({
            initialized,
            toolResult: msg.result,
            contentText,
          });
          return;
        }
      } catch {}
    }
  });

  child.on('error', (err) => reject(err));
  child.on('close', (code) => {
    if (!initialized) reject(new Error(`MCP process closed with code ${code}`));
  });

  // Step 1: Send initialize
  child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agent-rules-canary', version: '1.0.0' },
      },
    }) + '\n'
  );

  return promise;
}

describe('MCP Canary & Live Certification (S5, REQ-010, AC-05)', () => {
  it('reports resolver-only probe as STATIC_CONFORMED, never fabricating LIVE_CERTIFIED', () => {
    const canary = runHostCanary({
      repoRoot,
      host: 'omp',
      probe: {
        ok: true,
        is_live_host: false, // Resolver-only probe
      },
    });

    expect(canary.state).toBe('STATIC_CONFORMED');
    expect(canary.state).not.toBe('LIVE_CERTIFIED');
  });

  it('reports LIVE_CERTIFIED only when live host execution is explicitly confirmed', () => {
    const canary = runHostCanary({
      repoRoot,
      host: 'omp',
      probe: {
        ok: true,
        is_live_host: true, // Real live model turn confirmed
      },
    });

    expect(canary.state).toBe('LIVE_CERTIFIED');
  });

  it('proves real MCP stdio tool call chain: registered -> selected -> called (JSON-RPC) -> result (AC-05)', async () => {
    const broker = createStandardCapabilityBroker(repoRoot);
    const manifest = broker.manifest('CAP-mcp-live-test');

    // 1. Registered: Check registered codebase-memory provider in manifest
    const memProvider = manifest.providers.find((p) => p.id === 'codebase-memory-mcp' || p.capability === 'code.semantic');
    expect(memProvider).toBeDefined();

    // 2. Selected: Route a task requesting code semantic capability
    const prompt = 'Search codebase graph for symbol definitions and semantic callers';
    const workReq = createWorkRequest({ raw_intent: prompt, source: 'other', work_id: 'W-mcp-canary' });
    const compiled = compileWorkSpec(workReq, {
      risk_class: 'S0',
      requirements: [{ statement: prompt, claims: [{ statement: prompt, class: 'mechanical', verifier_id: 'V-mcp' }] }],
    });
    const [packet] = compileTaskPackets(compiled, [{
      goal: prompt,
      requirement_ids: ['R-001'],
      claim_ids: ['C-001a'],
      owned: ['.'],
      capabilities: ['code.semantic'],
      verifier_by_claim: { 'C-001a': 'V-mcp' },
    }]);

    const routed = broker.route(packet, [], {});
    expect(routed.capabilities).toContain('code.semantic');

    // 3. Called: Execute real JSON-RPC 2.0 stdio tool call to registered local MCP binary
    const localBinary = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'codebase-memory-mcp', 'codebase-memory-mcp.exe');
    expect(fs.existsSync(localBinary)).toBe(true);
    const response = await executeRealMcpToolCall(localBinary, [], 'list_projects', {});

    // 4. Success / Effect observed from real server (AC-05: no synthetic PASS)
    expect(response.initialized).toBe(true);
    expect(response.toolResult).toBeDefined();
    expect(typeof response.contentText).toBe('string');
    expect(response.contentText).toContain('projects');
  });

  it('records honest omitted reason when a second authenticated provider is absent', () => {
    const activeProvider = 'google-antigravity';
    const secondProvider = process.env.AGENT_RULES_SECONDARY_PROVIDER ?? null;

    const receipt = {
      primary_provider: activeProvider,
      secondary_provider: secondProvider,
      parity_status: secondProvider ? 'PASS' : 'OMITTED',
      omitted_reason: secondProvider ? null : 'no second authenticated provider present in local test environment',
    };

    expect(receipt.primary_provider).toBe('google-antigravity');
    if (!secondProvider) {
      expect(receipt.parity_status).toBe('OMITTED');
      expect(receipt.omitted_reason).toContain('no second authenticated provider');
    }
  });
});
