#!/usr/bin/env node
/** Probe the explicitly authorised Pencil seam without auto-installing it. */
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('integrations/manual/pencil-mcp/manifest.json', 'utf8'));
if (manifest.activation !== 'explicit-only' || manifest.id !== 'pencil-mcp') throw new Error('Pencil manifest is not explicit-only');
const connected = process.env.PENCIL_MCP_CONNECTED === 'true';
const penFile = process.env.PENCIL_FILE || '';
const available = connected && penFile.length > 0 && fs.existsSync(penFile);
const result = available
  ? { status: 'READY', provider: 'pencil-mcp', pen_file: penFile, production_acceptance: 'browser/runtime proof still required' }
  : { status: 'BLOCKED', provider: 'pencil-mcp', reason: 'Pencil desktop/editor or connected MCP/.pen file is unavailable', fallback: 'continue with existing Control Plane and deterministic browser proof', activation: 'none' };
console.log(JSON.stringify(result));
