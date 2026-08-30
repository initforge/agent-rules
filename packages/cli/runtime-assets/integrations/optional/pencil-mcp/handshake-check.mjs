#!/usr/bin/env node
// Real Pencil MCP handshake check. Spawns the stable launcher exactly as the
// host would, performs an MCP initialize + tools/list round-trip, and reports
// the live tool names. Exits 0 only on a genuine handshake.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = process.env.PENCIL_MCP_LAUNCHER || path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'launch.mjs',
);
const args = process.argv.slice(2).length ? process.argv.slice(2) : [];
const overallTimeoutMs = Number(process.env.PENCIL_HANDSHAKE_TIMEOUT_MS || 60000);
const toolCall = process.env.PENCIL_HANDSHAKE_TOOL || '';

const child = spawn(process.execPath, [launcher, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
const transcript = [];
const tools = [];
let handshake = false;
let toolsResult = null;

const deadline = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, reason: 'overall timeout', transcript }, null, 2));
  child.kill('SIGKILL');
  process.exit(1);
}, overallTimeoutMs);

const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  for (const line of chunk.split('\n').filter(Boolean)) {
    transcript.push(line.slice(0, 400));
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed?.method === 'initialize' || parsed?.method === 'notifications/initialized') continue;
    if (parsed?.id === 1 && parsed?.result?.protocolVersion) {
      handshake = true;
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    } else if (parsed?.id === 2 && parsed?.result?.tools) {
      toolsResult = parsed.result.tools;
      tools.push(...toolsResult.map((tool) => tool.name));
      if (toolCall) {
        if (!tools.includes(toolCall)) {
          clearTimeout(deadline);
          console.error(JSON.stringify({ ok: false, reason: `tool ${toolCall} not exposed`, tools }, null, 2));
          child.kill('SIGKILL');
          process.exit(1);
        }
        send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: toolCall, arguments: {} } });
        return;
      }
      finish(tools, null);
    } else if (parsed?.id === 3) {
      finish(tools, parsed.result);
    }
  }
});

function finish(tools, toolResult) {
  clearTimeout(deadline);
  const report = {
    ok: handshake && tools.length > 0,
    handshake,
    toolCount: tools.length,
    tools: tools.sort(),
    toolCall: toolResult ? { name: toolCall, ok: !toolResult.isError, hasContent: Array.isArray(toolResult.content) && toolResult.content.length > 0 } : undefined,
    server: 'launcher: ' + path.basename(launcher) + (args.length ? ' args: ' + args.join(' ') : ''),
  };
  console.log(JSON.stringify(report, null, 2));
  child.kill('SIGKILL');
  process.exit(report.ok ? 0 : 1);
}

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  transcript.push('stderr: ' + chunk.slice(0, 300));
});

child.on('error', (err) => {
  clearTimeout(deadline);
  console.error(JSON.stringify({ ok: false, reason: `spawn error: ${err.code}: ${err.message}`, transcript }, null, 2));
  process.exit(1);
});

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'agent-rules-handshake-check', version: '1.0.0' } } });
