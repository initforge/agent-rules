import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPABILITY_ALIASES,
  canonicalCapability,
  createStandardCapabilityBroker,
} from '../src/northstar/routing.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('additive capability aliases (REQ-002 / skill-mcp-fabric-v1)', () => {
  it('maps logical capability names to canonical registry names', () => {
    expect(CAPABILITY_ALIASES['docs.library']).toBe('docs.lookup');
    expect(CAPABILITY_ALIASES['shell.output.reduce']).toBe('output.compress');
    expect(CAPABILITY_ALIASES['code.graph']).toBe('code.semantic');
    expect(CAPABILITY_ALIASES['code.symbol']).toBe('code.semantic');
    expect(CAPABILITY_ALIASES['design.pen']).toBe('design.inspect');
    expect(canonicalCapability('docs.library')).toBe('docs.lookup');
    expect(canonicalCapability('unknown.capability')).toBe('unknown.capability');
  });

  it('resolves aliased capabilities to the same provider as their canonical name', () => {
    const broker = createStandardCapabilityBroker(REPO_ROOT);
    expect(broker.resolve('docs.library')?.id).toBe(broker.resolve('docs.lookup')?.id);
    expect(broker.resolve('shell.output.reduce')?.id).toBe(broker.resolve('output.compress')?.id);
    expect(broker.resolve('code.graph')?.id).toBe(broker.resolve('code.semantic')?.id);
    expect(broker.resolve('code.symbol')?.id).toBe(broker.resolve('code.semantic')?.id);
  });

  it('resolves docs.library to the Context7 provider from the canonical registry', () => {
    const broker = createStandardCapabilityBroker(REPO_ROOT);
    expect(broker.resolve('docs.library')?.id).toBe('context7');
  });

  it('resolves shell.output.reduce to the RTK middleware provider', () => {
    const broker = createStandardCapabilityBroker(REPO_ROOT);
    expect(broker.resolve('shell.output.reduce')?.id).toBe('rtk');
  });

  it('keeps design.pen explicit-only like its canonical design.inspect capability', () => {
    const broker = createStandardCapabilityBroker(REPO_ROOT);
    expect(broker.resolve('design.pen')).toBeNull();
    expect(broker.resolve('design.pen', ['pencil-mcp'])?.id).toBe('pencil-mcp');
    expect(broker.provider('pencil-mcp', 'design.pen')?.id).toBe('pencil-mcp');
  });

  it('never fabricates a provider for unknown capabilities', () => {
    const broker = createStandardCapabilityBroker(REPO_ROOT);
    expect(broker.resolve('capability.that.does.not.exist')).toBeNull();
  });
});
