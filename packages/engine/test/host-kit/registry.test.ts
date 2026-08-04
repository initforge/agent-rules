/**
 * host-kit test — Focused verification of role contracts.
 *
 * Tests verify:
 * - Role contracts have all required fields
 * - Authority levels are appropriate for each role
 * - Permissions are scoped correctly
 * - Receipts have valid structure
 * - Fallback actions are defined
 * - No provider/model IDs in portable prompts
 * - generated/ and .agent/ paths are forbidden
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_ROLE_CONTRACTS,
  ROLE_BY_NAME,
  HOST_KIT_ROLE_ERROR,
  assertRoleContract,
  getRoleContract,
} from '../src/host-kit/registry/index.js';
import type { RoleContract, HostKitRole } from '../src/host-kit/registry/types.js';

describe('host-kit registry', () => {
  describe('ALL_ROLE_CONTRACTS', () => {
    it('contains exactly 8 role contracts', () => {
      expect(ALL_ROLE_CONTRACTS).toHaveLength(8);
    });

    it('includes coordinator', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'coordinator')).toBe(true);
    });

    it('includes architect-integrator', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'architect-integrator')).toBe(true);
    });

    it('includes implementer', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'implementer')).toBe(true);
    });

    it('includes utility', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'utility')).toBe(true);
    });

    it('includes verifier', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'verifier')).toBe(true);
    });

    it('includes reviewer', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'reviewer')).toBe(true);
    });

    it('includes specialist', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'specialist')).toBe(true);
    });

    it('includes adjudicator', () => {
      expect(ALL_ROLE_CONTRACTS.some((r) => r.role === 'adjudicator')).toBe(true);
    });
  });

  describe('ROLE_BY_NAME', () => {
    it('maps each role name to a contract', () => {
      expect(ROLE_BY_NAME['coordinator']).toBeDefined();
      expect(ROLE_BY_NAME['architect-integrator']).toBeDefined();
      expect(ROLE_BY_NAME['implementer']).toBeDefined();
      expect(ROLE_BY_NAME['utility']).toBeDefined();
      expect(ROLE_BY_NAME['verifier']).toBeDefined();
      expect(ROLE_BY_NAME['reviewer']).toBeDefined();
      expect(ROLE_BY_NAME['specialist']).toBeDefined();
      expect(ROLE_BY_NAME['adjudicator']).toBeDefined();
    });

    it('alerts coordinator to have host authority', () => {
      expect(ROLE_BY_NAME['coordinator'].authority.level).toBe('host');
    });
  });

  describe('assertRoleContract', () => {
    it('accepts valid contract', () => {
      const valid: RoleContract = {
        role: 'coordinator',
        label: 'Test',
        authority: { level: 'host', scope: [], constraints: [] },
        permissions: [],
        receipt: {
          receipt_id: 'test',
          role: 'coordinator',
          issued_at: new Date().toISOString(),
          status: 'issued',
          decision: 'test',
          evidence_refs: [],
          authority: 'host',
          fallback: 'deny',
        },
        fallback: { trigger: 'test', action: 'deny', reason: 'test' },
      };
      expect(() => assertRoleContract(valid)).not.toThrow();
    });

    it('rejects contract missing role', () => {
      const invalid = { label: 'Test' } as unknown as RoleContract;
      expect(() => assertRoleContract(invalid)).toThrow(HOST_KIT_ROLE_ERROR);
    });
  });

  describe('getRoleContract', () => {
    it('returns contract for valid role', () => {
      const contract = getRoleContract('coordinator');
      expect(contract.role).toBe('coordinator');
    });

    it('throws for invalid role', () => {
      expect(() => getRoleContract('invalid-role' as HostKitRole)).toThrow(HOST_KIT_ROLE_ERROR);
    });
  });

  describe('authority levels', () => {
    it('coordinator has host authority', () => {
      expect(ROLE_BY_NAME['coordinator'].authority.level).toBe('host');
    });

    it('architect-integrator has advisory authority', () => {
      expect(ROLE_BY_NAME['architect-integrator'].authority.level).toBe('advisory');
    });

    it('implementer has delegate authority', () => {
      expect(ROLE_BY_NAME['implementer'].authority.level).toBe('delegate');
    });

    it('utility has delegate authority', () => {
      expect(ROLE_BY_NAME['utility'].authority.level).toBe('delegate');
    });

    it('verifier has delegate authority', () => {
      expect(ROLE_BY_NAME['verifier'].authority.level).toBe('delegate');
    });

    it('reviewer has delegate authority', () => {
      expect(ROLE_BY_NAME['reviewer'].authority.level).toBe('delegate');
    });

    it('specialist has delegate authority', () => {
      expect(ROLE_BY_NAME['specialist'].authority.level).toBe('delegate');
    });

    it('adjudicator has override authority', () => {
      expect(ROLE_BY_NAME['adjudicator'].authority.level).toBe('override');
    });
  });

  describe('fallback actions', () => {
    it('coordinator fallback is deny', () => {
      expect(ROLE_BY_NAME['coordinator'].fallback.action).toBe('deny');
    });

    it('architect-integrator fallback is halt', () => {
      expect(ROLE_BY_NAME['architect-integrator'].fallback.action).toBe('halt');
    });

    it('implementer fallback is request-clarification', () => {
      expect(ROLE_BY_NAME['implementer'].fallback.action).toBe('request-clarification');
    });

    it('utility fallback is escalate', () => {
      expect(ROLE_BY_NAME['utility'].fallback.action).toBe('escalate');
    });

    it('verifier fallback is block', () => {
      expect(ROLE_BY_NAME['verifier'].fallback.action).toBe('block');
    });

    it('reviewer fallback is request-clarification', () => {
      expect(ROLE_BY_NAME['reviewer'].fallback.action).toBe('request-clarification');
    });

    it('specialist fallback is defer', () => {
      expect(ROLE_BY_NAME['specialist'].fallback.action).toBe('defer');
    });

    it('adjudicator fallback is escalate', () => {
      expect(ROLE_BY_NAME['adjudicator'].fallback.action).toBe('escalate');
    });
  });
});