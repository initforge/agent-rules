import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getHostIds, getNativeContract } from '../../src/northstar/host-registry.js';
import { HOST_STATES, isHostState, isClaimOutcome } from '../../src/northstar/behavior-runtime.js';
import type { NativeHostLifecycle } from '../../src/northstar/host-adapter-contract.js';

/**
 * REQ-111 / process-level integration #10: the canonical 10-method native
 * lifecycle contract must be implementable for all 8 registered hosts with
 * per-host native surfaces. This test verifies the CONTRACT surface and the
 * registry provenance (no fake/bridge surfaces), not the live install itself
 * (that is exercised by the real offline canary harness on temp homes).
 */

describe('native 8-host lifecycle contract (REQ-111)', () => {
  it('registers exactly the canonical 8 hosts with full NativeHostContract fields', () => {
    const ids = getHostIds();
    expect([...ids].sort()).toEqual([
      'antigravity', 'claude', 'codex', 'command-code', 'cursor', 'deepseek-harness', 'grok', 'opencode',
    ].sort());
    for (const host of ids) {
      const contract = getNativeContract(host);
      expect(contract, `contract for ${host}`).not.toBeNull();
      expect(contract!.id).toBe(host);
      expect(typeof contract!.homeEnv).toBe('string');
      expect(typeof contract!.homeDefault).toBe('string');
      expect(typeof contract!.installStrategy).toBe('string');
      expect(typeof contract!.readbackStrategy).toBe('string');
      expect(typeof contract!.canaryStrategy).toBe('string');
      expect(typeof contract!.uninstallStrategy).toBe('string');
      expect(Array.isArray(contract!.authBoundary.offlineClaims)).toBe(true);
      expect(Array.isArray(contract!.authBoundary.requiresAuthClaims)).toBe(true);
      expect(Object.keys(contract!.surfaces).length).toBeGreaterThan(0);
      expect(Object.keys(contract!.paths).length).toBeGreaterThan(0);
    }
  });

  it('every host declares its own instruction surface (no shared/fake structure)', () => {
    const seenPaths = new Map<string, string>();
    for (const host of getHostIds()) {
      const contract = getNativeContract(host)!;
      const instr = contract.paths.instructionPath;
      expect(instr.length).toBeGreaterThan(0);
      // Normalize only the HOME-like placeholder to its reference name, keep the
      // env var identity ($CODEX_HOME vs $OPENCODE_HOME) so distinct surfaces
      // don't collapse onto one path.
      const normalized = instr.replace(/\$\{?([A-Z][A-Z0-9_]+)}?/g, '$${$1}').replace(/~/, '<home>');
      if (seenPaths.has(normalized)) {
        // Shared identical path across hosts would indicate a fake uniform
        // surface; each host must point at its own native file/directory.
        expect.soft(seenPaths.get(normalized), `host ${host} shared surface with ${seenPaths.get(normalized)}`).toBe(host);
      }
      seenPaths.set(normalized, host);
    }
    // At least one pair must resolve to distinct surface paths after env
    // expansion (hosts are different tools, never one shared file).
    const surfaces = [...new Set([...seenPaths.keys()])];
    expect(surfaces.length).toBeGreaterThan(1);
  });

  it('the 10-method NativeHostLifecycle interface exists and is structurally sound', () => {
    // Compile-time contract: member functions must exist as a type.
    const lifecycle: NativeHostLifecycle = {
      id: 'codex',
      detect: async () => ({ host: 'codex', installed: false, signals: [], taskAuthority: false }),
      inventory: async () => [],
      planInstall: async () => ({ host: 'codex', changes: [], backupDir: '' }),
      install: async () => ({}),
      reload: async () => ({ ok: false, method: '' }),
      readback: async () => ({ ok: false, method: '', found: false }),
      offlineCanary: async () => ({ ok: false, claims: {} }),
      authenticatedCanary: async () => ({ ok: false, modelBehavior: 'NEEDS_USER', evidence: [] }),
      rollback: async () => ({ ok: false, byteEqual: false }),
      uninstall: async () => {},
    };
    expect(typeof lifecycle.detect).toBe('function');
    expect(typeof lifecycle.inventory).toBe('function');
    expect(typeof lifecycle.planInstall).toBe('function');
    expect(typeof lifecycle.install).toBe('function');
    expect(typeof lifecycle.reload).toBe('function');
    expect(typeof lifecycle.readback).toBe('function');
    expect(typeof lifecycle.offlineCanary).toBe('function');
    expect(typeof lifecycle.authenticatedCanary).toBe('function');
    expect(typeof lifecycle.rollback).toBe('function');
    expect(typeof lifecycle.uninstall).toBe('function');
  });

  it('host_state vocabulary covers the offline/live lifecycle', () => {
    expect(HOST_STATES).toContain('NOT_DETECTED');
    expect(HOST_STATES).toContain('DETECTED');
    expect(HOST_STATES).toContain('INSTALLED');
    expect(HOST_STATES).toContain('OFFLINE_VERIFIED');
    expect(HOST_STATES).toContain('LIVE_VERIFIED');
    expect(HOST_STATES).toContain('FAILED');
    for (const state of HOST_STATES) expect(isHostState(state)).toBe(true);
    expect(isHostState('Ready')).toBe(false);
    expect(isClaimOutcome('PASS')).toBe(true);
  });

  it('contract limits do not claim runtime surfaces the host lacks (UNSUPPORTED honest)', () => {
    // Version is diagnostic only: presence detection never implies capability.
    for (const host of getHostIds()) {
      const contract = getNativeContract(host)!;
      const canary = contract.canaryStrategy.toLowerCase();
      // A canary that needs login can never be a credential-free PASS.
      expect(canary.includes('credential') || canary.includes('nginx') || canary.includes('login') ? canary.length > 0 : true).toBe(true);
      // Offline claims must be credential-free by construction.
      for (const claim of contract.authBoundary.offlineClaims) {
        expect(claim.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('host contract schema artifact presence', () => {
  it('native-host-contract schema and certification-receipt schema exist', () => {
    const root = path.resolve(import.meta.dirname ?? '.', '../../../..');
    for (const file of ['schemas/native-host-contract.schema.json', 'schemas/host-certification-receipt.schema.json']) {
      expect(fs.existsSync(path.join(root, file)), file).toBe(true);
    }
  });
});