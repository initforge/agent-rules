#!/usr/bin/env node
/**
 * test/helpers/fake-mcp-server.mjs — minimal MCP stdio server for tests.
 * JSON-RPC 2.0 over stdio: initialize / notifications/initialized / tools/list
 * / ping / echo. Env AGENT_RULES_FAKE_MCP_EXIT_AFTER_MS can force an exit to
 * simulate provider process death (reconnect tests).
 */
import { readFileSync } from 'node:fs';

const marker = 'fake-mcp-server';
const exitAfterMs = Number(process.env.AGENT_RULES_FAKE_MCP_EXIT_AFTER_MS || 0);

let buffer = '';

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(msg) {
  if (msg.id === undefined && msg.id === null && msg.method === 'notifications/initialized') {
    return null;
  }
  switch (msg.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-mcp-server', version: '1.2.3' },
        },
      };
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            { name: 'tool_a', description: 'first' },
            { name: 'tool_b', description: 'second' },
          ],
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    case 'tools/call':
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(msg.params ?? {}) }],
          isError: false,
        },
      };
    default:
      if (msg.id !== undefined) {
        return { jsonrpc: '2.0', id: msg.id, result: { echo: msg.params ?? null } };
      }
      return null;
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const out = handle(msg);
    if (out) send(out);
  }
});

process.stderr.write(`${marker}:ready\n`);

if (exitAfterMs > 0) {
  setTimeout(() => {
    process.exit(0);
  }, exitAfterMs);
}

// Keep the marker greppable in /proc for fake-X11 attribution.
if (process.env.AGENT_RULES_FAKE_MCP_NAME) {
  process.title = `${marker}-${process.env.AGENT_RULES_FAKE_MCP_NAME}`;
}
