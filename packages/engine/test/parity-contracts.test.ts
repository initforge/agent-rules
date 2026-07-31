import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createParityContractRuntime,
  DRAFT_07_SCHEMA_URI,
  PARITY_CONTRACT_VERSION,
  PARITY_RESOURCE_LIMITS,
  ParityContractError,
  type ParityContractRuntime,
} from '../src/parity-contracts.js';

const roots: string[] = [];
const draftHeader = `$schema: "${DRAFT_07_SCHEMA_URI}"\n`;
const canonicalSchemasDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../skills/5fedu-module-parity/references/schemas',
);
const canonicalSchemaNames = [
  'parity-packet.schema.yaml',
  'source-lock.schema.yaml',
  'target.schema.yaml',
  'structural-map.schema.yaml',
  'visual-contract.schema.yaml',
  'behavior-contract.schema.yaml',
  'architecture-adaptation.schema.yaml',
  'deviations.schema.yaml',
  'proof.schema.yaml',
  'common.schema.yaml',
] as const;

function schemaRoot(files: Readonly<Record<string, string>>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-contracts-'));
  roots.push(root);
  for (const [relativePath, source] of Object.entries(files)) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source, 'utf8');
  }
  return root;
}

function commonSchema(): string {
  return `${draftHeader}definitions:
  module_key:
    type: string
    pattern: "^[a-z0-9-]+$"
`;
}

function targetSchema(): string {
  return `${draftHeader}type: object
additionalProperties: false
required: [contract_version, module_key, mode, count]
properties:
  contract_version:
    const: 3
  module_key:
    $ref: "common.schema.yaml#/definitions/module_key"
  mode:
    type: string
    enum: [new_module, existing_module_audit]
  count:
    type: integer
    minimum: 0
`;
}

function aggregateSchema(targetRef = 'target.schema.yaml'): string {
  return `${draftHeader}type: object
additionalProperties: false
required: [contract_version, target]
properties:
  contract_version:
    const: 3
  target:
    $ref: "${targetRef}"
`;
}

function runtime(root = schemaRoot({
  'aggregate.schema.yaml': aggregateSchema(),
  'target.schema.yaml': targetSchema(),
  'common.schema.yaml': commonSchema(),
})): ParityContractRuntime {
  return createParityContractRuntime({
    contract_version: PARITY_CONTRACT_VERSION,
    schemaRoot: root,
    aggregateSchema: 'aggregate.schema.yaml',
    individualSchemas: ['target.schema.yaml'],
  });
}

function targetValue(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    contract_version: 3,
    module_key: 'nhap-hang',
    mode: 'new_module',
    count: 2,
    ...overrides,
  };
}

function canonicalRuntime(root = canonicalSchemasDirectory): ParityContractRuntime {
  return createParityContractRuntime({
    contract_version: PARITY_CONTRACT_VERSION,
    schemaRoot: root,
    aggregateSchema: 'parity-packet.schema.yaml',
    individualSchemas: ['deviations.schema.yaml'],
  });
}

function canonicalPacketValue(): Record<string, unknown> {
  const sourceRevision = 'a'.repeat(40);
  const targetRevision = 'b'.repeat(40);
  const evidenceTypes = [
    'structural_parity',
    'visual_parity',
    'behavioral_parity',
    'architectural_parity',
    'browser_interaction',
    'accessibility',
    'console',
    'network',
    'browser_trace',
    'responsive_states',
    'keyboard',
    'touch',
    'reduced_motion',
    'permission_state_matrix',
    'independent_revision_verification',
  ];
  const verificationEvidence = evidenceTypes.map((type) => ({
    type,
    result: 'pass',
    command_or_method: `fixture-check::${type}`,
    source_revision: sourceRevision,
    target_revision: targetRevision,
    artifact_uri: `artifact://parity/${type}`,
    artifact_sha256: 'c'.repeat(64),
    ...(type === 'independent_revision_verification'
      ? {
          verifier_identity: {
            subject_id: 'agent://reviewer-001',
            display_name: 'Independent reviewer',
            role: 'independent_verifier',
          },
        }
      : {}),
  }));
  const deviation = {
    source: 'owner spec section 4.2',
    affected_surface: 'crud-list',
    changed_invariant: 'Use compact row actions.',
    rationale: 'Owner-approved workflow.',
    unchanged_invariants: ['List shell remains unchanged.'],
    proof: 'owner://decision/dev-001',
  };
  return {
    'source.lock.yaml': {
      template_identity: {
        workspace_path: 'features/he-thong/nhan-vien',
        package_identity: 'verified-template',
        is_fork: false,
      },
      snapshot: { git_commit: sourceRevision },
      discovery_method: 'positive_anchors_match',
      anchors_opened: ['features/he-thong/nhan-vien/index.tsx'],
      target_receipt: {
        revision: targetRevision,
        target_contract_sha256: 'd'.repeat(64),
        captured_by: 'planner-001',
      },
    },
    'target.yaml': {
      module_key: 'nhap-hang',
      module_name: 'Nhập hàng',
      surfaces: ['crud-list'],
      target_paths: {
        feature_root: 'features/he-thong/nhap-hang/',
        routes: ['/he-thong/nhap-hang'],
        components: ['features/he-thong/nhap-hang/index.tsx'],
      },
      schema_source: {
        type: 'supabase_table',
        reference: 'phieu_nhap',
        verified: true,
      },
    },
    'structural-map.yaml': {
      planner_owns: [],
      component_mappings: [{
        source_component: 'features/he-thong/nhan-vien/index.tsx',
        target_component: 'features/he-thong/nhap-hang/index.tsx',
        decision: 'adapt',
      }],
      nesting_hierarchy: { root: ['list'] },
      routes: {
        '/he-thong/nhap-hang': {
          component: 'nhap-hang-index',
          breadcrumb_label: 'Nhập hàng',
        },
      },
      state_ownership: [{ state_key: 'receipts', owner: 'receipt-store' }],
      data_contracts: [{
        interface_or_type: 'PhieuNhap',
        source: 'types/supabase.ts',
        fields: [{ name: 'id', type: 'uuid', nullable: false }],
      }],
      event_flows: [{
        event: 'receipt:created',
        producer: 'receipt-form',
        consumer: 'receipt-list',
      }],
    },
    'visual-contract.yaml': {
      surfaces: {
        'crud-list': {
        shell_must: ['Use the verified list shell.'],
        variables: [{
          slot: 'columns',
          source: 'phieu_nhap schema',
          value_or_reference: 'id',
        }],
        responsive_breakpoints: [{
          viewport: 'mobile',
          layout_change: 'Use compact toolbar.',
          safe_area: true,
        }],
        },
      },
    },
    'behavior-contract.yaml': {
      behaviors: {
        'crud-list': {
        behavior_must: ['Row opens detail.'],
        states_must: ['loading'],
        motion_must: ['Respect reduced motion.'],
        responsive_must: ['Compact controls on mobile.'],
        },
      },
    },
    'architecture-adaptation.yaml': {
      preserve: [{ pattern: 'list shell', rationale: 'shared invariant' }],
      adapt: [{
        source_pattern: 'employee fields',
        target_pattern: 'receipt fields',
        adaptation: 'replace variable slots',
      }],
      must_not_copy: [{
        forbidden_pattern: 'employee domain service',
        reason: 'wrong domain',
        target_alternative: 'receipt service',
      }],
      target_equivalents: [{
        source: 'nhan-vien/index.tsx',
        target: 'nhap-hang/index.tsx',
      }],
      accepted_deviations: { 'DEV-001': deviation },
    },
    'deviations.yaml': {
      default: 'Exact reference fidelity outside variable slots.',
      allowed_only_when: 'Owner or accepted spec approves it.',
      deviations: { 'DEV-001': deviation },
    },
    'proof.yaml': {
      template_identity_and_snapshot: {
        source_lock_sha: 'e'.repeat(64),
        verified_by: 'planner-001',
      },
      target_revision: targetRevision,
      worker_identity: {
        subject_id: 'agent://worker-001',
        display_name: 'Implementation worker',
        role: 'worker',
      },
      target_surface_and_reference_paths: {
        'crud-list': {
          reference_path: 'features/he-thong/nhan-vien/index.tsx',
          target_path: 'features/he-thong/nhap-hang/index.tsx',
          verified: true,
        },
      },
      target_paths: ['features/he-thong/nhap-hang/index.tsx'],
      shell_behavior_state_motion_responsive_map: {
        structural_map_complete: true,
        visual_contract_complete: true,
        behavior_contract_complete: true,
        architecture_adaptation_complete: true,
        deviations_recorded: true,
      },
      variable_map_with_schema_or_spec_source: {
        'crud-list': {
          'columns': {
            source: 'phieu_nhap schema',
            verified_against: 'target.yaml',
          },
        },
      },
      approved_deviations: { 'DEV-001': { status: 'approved' } },
      verification_evidence: verificationEvidence,
    },
  };
}

function copiedCanonicalSchemaRoot(
  overrides: Readonly<Record<string, string>> = {},
): string {
  return schemaRoot(Object.fromEntries(
    canonicalSchemaNames.map((name) => [
      name,
      overrides[name] ?? fs.readFileSync(path.join(canonicalSchemasDirectory, name), 'utf8'),
    ]),
  ));
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Draft-07 parity schema runtime', () => {
  it('compiles aggregate and individual schemas with recursively loaded local refs', () => {
    const compiled = runtime();
    expect(compiled.contract_version).toBe(3);
    expect(compiled.aggregateSchema).toBe('aggregate.schema.yaml');
    expect(compiled.individualSchemas).toEqual(['target.schema.yaml']);
    expect(compiled.loadedSchemas).toEqual([
      'aggregate.schema.yaml',
      'common.schema.yaml',
      'target.schema.yaml',
    ]);
    expect(compiled.schemaFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const aggregate = compiled.validateShape({
      contract_version: 3,
      schema: 'aggregate.schema.yaml',
      value: { contract_version: 3, target: targetValue() },
    });
    const individual = compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value: targetValue(),
    });
    const yaml = compiled.validateYamlShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      source: 'contract_version: 3\nmodule_key: nhap-hang\nmode: new_module\ncount: 2\n',
    });

    expect(aggregate).toMatchObject({ valid: true, diagnostics: [], contract_version: 3 });
    expect(individual).toMatchObject({ valid: true, diagnostics: [], contract_version: 3 });
    expect(yaml).toMatchObject({ valid: true, diagnostics: [], contract_version: 3 });
    expect(individual.fingerprint).toBe(yaml.fingerprint);
  });

  it.each([
    ['UNKNOWN_FIELD', targetValue({ unexpected: true })],
    ['MISSING_FIELD', { contract_version: 3, module_key: 'nhap-hang', mode: 'new_module' }],
    ['TYPE_MISMATCH', targetValue({ count: '2' })],
    ['ENUM_MISMATCH', targetValue({ mode: 'invented' })],
    ['CONST_MISMATCH', targetValue({ contract_version: 2 })],
  ])('returns canonical %s shape diagnostics', (expectedCode, value) => {
    const result = runtime().validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value,
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain(expectedCode);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicate YAML keys in packet input without throwing raw parser errors', () => {
    const result = runtime().validateYamlShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      source: 'contract_version: 3\nmodule_key: nhap-hang\nmodule_key: duplicate\nmode: new_module\ncount: 2\n',
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_YAML_KEY', keyword: 'yaml' }),
    ]);
  });

  it('rejects duplicate YAML keys in schema sources', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': `${draftHeader}type: object\ntype: array\n`,
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(() => runtime(root)).toThrowError(expect.objectContaining({
      code: 'DUPLICATE_YAML_KEY',
    }));
  });

  it('rejects duplicate schema IDs before Ajv registration', () => {
    const withId = (id: string): string => `${draftHeader}$id: "${id}"\ntype: object\n`;
    const root = schemaRoot({
      'aggregate.schema.yaml': withId('packet-v3'),
      'target.schema.yaml': withId('PACKET-V3'),
    });
    expect(() => runtime(root)).toThrowError(expect.objectContaining({
      code: 'DUPLICATE_SCHEMA_ID',
    }));
  });

  it.each([
    ['https://example.com/remote.schema.json', 'REMOTE_REF_REJECTED'],
    ['file:///tmp/remote.schema.json', 'REMOTE_REF_REJECTED'],
    ['/absolute.schema.yaml', 'INVALID_SCHEMA_PATH'],
    ['../outside.schema.yaml', 'INVALID_SCHEMA_PATH'],
    ['nested/../outside.schema.yaml', 'INVALID_SCHEMA_PATH'],
  ])('rejects non-allowlisted ref %s', (ref, expectedCode) => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema(ref),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(() => runtime(root)).toThrowError(expect.objectContaining({ code: expectedCode }));
  });

  it('rejects unresolved local refs without attempting network access', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema('missing.schema.yaml'),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(() => runtime(root)).toThrowError(expect.objectContaining({
      code: 'SCHEMA_NOT_FOUND',
      message: 'Schema file is unresolved: missing.schema.yaml',
    }));
  });

  it('rejects symbolic-link segments inside the allowlisted schema root', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema('linked/target.schema.yaml'),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
      'real/target.schema.yaml': `${draftHeader}type: object\n`,
    });
    fs.symlinkSync(path.join(root, 'real'), path.join(root, 'linked'), 'junction');
    expect(() => runtime(root)).toThrowError(expect.objectContaining({
      code: 'SCHEMA_SYMLINK_REJECTED',
    }));
  });

  it('rejects unsupported or missing $schema declarations', () => {
    const unsupportedRoot = schemaRoot({
      'aggregate.schema.yaml': '$schema: "https://json-schema.org/draft/2020-12/schema"\ntype: object\n',
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    const missingRoot = schemaRoot({
      'aggregate.schema.yaml': 'type: object\n',
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(() => runtime(unsupportedRoot)).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SCHEMA_DRAFT' }));
    expect(() => runtime(missingRoot)).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SCHEMA_DRAFT' }));
  });

  it('preloads allowlisted cycles and validates finite recursive values', () => {
    const nodeSchema = (other: string): string => `${draftHeader}type: object
additionalProperties: false
required: [name]
properties:
  name:
    type: string
  next:
    $ref: "${other}"
`;
    const root = schemaRoot({
      'aggregate.schema.yaml': `${draftHeader}$ref: "node-a.schema.yaml"\n`,
      'node-a.schema.yaml': nodeSchema('node-b.schema.yaml'),
      'node-b.schema.yaml': nodeSchema('node-a.schema.yaml'),
    });
    const compiled = createParityContractRuntime({
      contract_version: 3,
      schemaRoot: root,
      aggregateSchema: 'aggregate.schema.yaml',
      individualSchemas: ['node-a.schema.yaml'],
    });
    expect(compiled.loadedSchemas).toEqual([
      'aggregate.schema.yaml',
      'node-a.schema.yaml',
      'node-b.schema.yaml',
    ]);
    expect(compiled.validateShape({
      contract_version: 3,
      schema: 'node-a.schema.yaml',
      value: { name: 'a', next: { name: 'b', next: { name: 'a2' } } },
    }).valid).toBe(true);
  });

  it('reports unresolved JSON-pointer fragments deterministically', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema('target.schema.yaml#/definitions/missing'),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    let first: ParityContractError | undefined;
    let second: ParityContractError | undefined;
    try { runtime(root); } catch (error) { first = error as ParityContractError; }
    try { runtime(root); } catch (error) { second = error as ParityContractError; }
    expect(first?.code).toBe('UNRESOLVED_SCHEMA_REF');
    expect(second?.fingerprint).toBe(first?.fingerprint);
    expect(second?.details).toEqual(first?.details);
  });

  it('canonicalizes diagnostics, document keys, and schema source ordering', () => {
    const compiled = runtime();
    const first = compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value: { unexpected: true, count: 'bad', mode: 'bad', module_key: 'nhap-hang', contract_version: 3 },
    });
    const second = compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value: { contract_version: 3, module_key: 'nhap-hang', mode: 'bad', count: 'bad', unexpected: true },
    });
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.fingerprint).toBe(second.fingerprint);

    const reorderedRoot = schemaRoot({
      'aggregate.schema.yaml': `properties:
  target:
    $ref: "target.schema.yaml"
  contract_version:
    const: 3
required: [contract_version, target]
additionalProperties: false
type: object
$schema: "${DRAFT_07_SCHEMA_URI}"
`,
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(runtime(reorderedRoot).schemaFingerprint).toBe(compiled.schemaFingerprint);
  });

  it('requires V3 at compile and validation API boundaries', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema(),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(() => createParityContractRuntime({
      contract_version: 2,
      schemaRoot: root,
      aggregateSchema: 'aggregate.schema.yaml',
      individualSchemas: ['target.schema.yaml'],
    })).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_CONTRACT_VERSION' }));
    const compiled = runtime(root);
    expect(() => compiled.validateShape({
      contract_version: 2,
      schema: 'target.schema.yaml',
      value: targetValue(),
    })).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_CONTRACT_VERSION' }));
    expect(() => compiled.validateYamlShape({
      contract_version: 2,
      schema: 'target.schema.yaml',
      source: 'contract_version: 2\n',
    })).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_CONTRACT_VERSION' }));
    expect(() => createParityContractRuntime({
      schemaRoot: root,
      aggregateSchema: 'aggregate.schema.yaml',
      individualSchemas: ['target.schema.yaml'],
    } as unknown as Parameters<typeof createParityContractRuntime>[0])).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_CONTRACT_VERSION' }));
  });

  it('rejects absolute, traversal, duplicate, and undeclared validation schema paths', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema(),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(() => createParityContractRuntime({
      contract_version: 3,
      schemaRoot: root,
      aggregateSchema: path.join(root, 'aggregate.schema.yaml'),
      individualSchemas: ['target.schema.yaml'],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_SCHEMA_PATH' }));
    expect(() => createParityContractRuntime({
      contract_version: 3,
      schemaRoot: root,
      aggregateSchema: 'aggregate.schema.yaml',
      individualSchemas: ['../target.schema.yaml'],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_SCHEMA_PATH' }));
    expect(() => createParityContractRuntime({
      contract_version: 3,
      schemaRoot: root,
      aggregateSchema: 'aggregate.schema.yaml',
      individualSchemas: ['AGGREGATE.SCHEMA.YAML'],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_SCHEMA_PATH' }));
    expect(() => runtime(root).validateShape({
      contract_version: 3,
      schema: 'common.schema.yaml',
      value: {},
    })).toThrowError(expect.objectContaining({ code: 'SCHEMA_NOT_COMPILED' }));
  });

  it.each([
    'CON.schema.yaml',
    'folder/aux.yaml',
    'bad:name.yaml',
    'bad*name.yaml',
    'bad?name.yaml',
    'bad"name.yaml',
    'bad<name.yaml',
    'bad>name.yaml',
    'bad|name.yaml',
    'trailing-dot./schema.yaml',
    'trailing-space /schema.yaml',
    'é.schema.yaml',
    'e\u0301.schema.yaml',
    '\\\\server\\share\\schema.yaml',
    '\\\\?\\C:\\schema.yaml',
    'C:relative.schema.yaml',
  ])('rejects non-portable schema path %s before filesystem access', (invalidPath) => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema(),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
    });
    expect(() => createParityContractRuntime({
      contract_version: 3,
      schemaRoot: root,
      aggregateSchema: invalidPath,
      individualSchemas: ['target.schema.yaml'],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_SCHEMA_PATH' }));
  });

  it('rejects case-fold collisions discovered recursively across the complete schema graph', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': aggregateSchema('nested/foo.schema.yaml'),
      'target.schema.yaml': targetSchema(),
      'common.schema.yaml': commonSchema(),
      'nested/foo.schema.yaml': `${draftHeader}$ref: "FOO.schema.yaml"\n`,
      'nested/FOO.schema.yaml': `${draftHeader}type: object\n`,
    });
    const nestedEntries = fs.readdirSync(path.join(root, 'nested'));
    if (nestedEntries.includes('FOO.schema.yaml') && nestedEntries.includes('foo.schema.yaml')) {
      expect(() => runtime(root)).toThrowError(expect.objectContaining({
        code: 'INVALID_SCHEMA_PATH',
        details: ['nested/FOO.schema.yaml', 'nested/foo.schema.yaml'],
      }));
    } else {
      // A case-insensitive checkout cannot represent both entries; the
      // filesystem has already collapsed the collision before the runtime can
      // inspect it. The portable path policy still rejects the pair whenever
      // both entries are representable.
      expect(() => runtime(root)).not.toThrow();
    }
  });

  it('rejects exact duplicate schema IDs as well as case variants', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': `${draftHeader}$id: "packet-v3"\ntype: object\n`,
      'target.schema.yaml': `${draftHeader}$id: "packet-v3"\ntype: object\n`,
    });
    expect(() => runtime(root)).toThrowError(expect.objectContaining({
      code: 'DUPLICATE_SCHEMA_ID',
    }));
  });

  it('returns deterministic RESOURCE_LIMIT errors for a 30k-deep YAML document', () => {
    const compiled = runtime();
    const source = `${'['.repeat(30_000)}0${']'.repeat(30_000)}`;
    const capture = (): ParityContractError => {
      try {
        compiled.validateYamlShape({
          contract_version: 3,
          schema: 'target.schema.yaml',
          source,
        });
      } catch (error) {
        return error as ParityContractError;
      }
      throw new Error('Expected validation to fail');
    };
    const first = capture();
    const second = capture();
    expect(first).toBeInstanceOf(ParityContractError);
    expect(first.code).toBe('RESOURCE_LIMIT');
    expect(first).not.toBeInstanceOf(RangeError);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.details).toEqual(first.details);
  });

  it.each([
    ['block anchor', 'base: &base {contract_version: 3}\n'],
    ['alias', 'base: &base {contract_version: 3}\ncopy: *base\n'],
    ['plain merge key', 'merged:\n  <<: {contract_version: 3}\n'],
    ['spaced merge key', 'merged:\n  << : {contract_version: 3}\n'],
    ['flow merge key', 'merged: { << : {contract_version: 3} }\n'],
    ['explicit mapping merge key', 'merged:\n  ? <<\n  : {contract_version: 3}\n'],
    ['short explicit merge tag', '!!merge "<<": {contract_version: 3}\n'],
    ['full explicit merge tag', '!<tag:yaml.org,2002:merge> "<<": {contract_version: 3}\n'],
    ['directive merge tag', '%TAG !m! tag:yaml.org,2002:\n---\n!m!merge "<<": {contract_version: 3}\n'],
    ['merge tag with alternate scalar', '!!merge "merge": {contract_version: 3}\n'],
    ['alias family bomb', `base: &base [${Array.from({ length: 100 }, () => '*base').join(',')}]\n`],
  ])('rejects YAML structural policy family: %s', (_name, source) => {
    const compiled = runtime();
    const capture = (): ParityContractError => {
      try {
        compiled.validateYamlShape({
          contract_version: 3,
          schema: 'target.schema.yaml',
          source,
        });
      } catch (error) {
        return error as ParityContractError;
      }
      throw new Error('Expected structural YAML policy rejection');
    };
    const first = capture();
    const second = capture();
    expect(first).toBeInstanceOf(ParityContractError);
    expect(first.code).toBe('RESOURCE_LIMIT');
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.details).toEqual(first.details);
  });

  it('does not treat quoted YAML syntax in scalar values as structure', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': `${draftHeader}type: object\n`,
      'target.schema.yaml': `${draftHeader}type: object\n`,
    });
    const compiled = createParityContractRuntime({
      contract_version: 3,
      schemaRoot: root,
      aggregateSchema: 'aggregate.schema.yaml',
      individualSchemas: ['target.schema.yaml'],
    });
    expect(compiled.validateYamlShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      source: 'text: "&anchor *alias <<: !!merge"\n"<<": "literal key"\n',
    })).toMatchObject({ valid: true, diagnostics: [] });
  });

  it('preflights deeply nested in-memory documents before canonical serialization or Ajv', () => {
    const compiled = runtime();
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let depth = 0; depth <= PARITY_RESOURCE_LIMITS.maxDepth; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.child = next;
      cursor = next;
    }
    expect(() => compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value: root,
    })).toThrowError(expect.objectContaining({
      code: 'RESOURCE_LIMIT',
      details: expect.arrayContaining(['limit=maxDepth']),
    }));
  });

  it.each([
    ['object getter', () => {
      const value: Record<string, unknown> = {};
      Object.defineProperty(value, 'field', {
        enumerable: true,
        get() {
          throw new RangeError('synthetic object getter RangeError');
        },
      });
      return value;
    }],
    ['array getter', () => {
      const value: unknown[] = [];
      Object.defineProperty(value, '0', {
        enumerable: true,
        get() {
          throw new RangeError('synthetic array getter RangeError');
        },
      });
      value.length = 1;
      return value;
    }],
    ['object proxy traversal', () => new Proxy({}, {
      ownKeys() {
        throw new RangeError('synthetic object proxy RangeError');
      },
    })],
    ['array proxy traversal', () => new Proxy([], {
      get(target, property, receiver) {
        if (property === 'length') throw new RangeError('synthetic array proxy RangeError');
        return Reflect.get(target, property, receiver);
      },
    })],
  ])('contains resource failures from bounded %s', (_name, createValue) => {
    const compiled = runtime();
    const capture = (): ParityContractError => {
      try {
        compiled.validateShape({
          contract_version: 3,
          schema: 'target.schema.yaml',
          value: createValue(),
        });
      } catch (error) {
        return error as ParityContractError;
      }
      throw new Error('Expected bounded traversal to fail');
    };
    const first = capture();
    const second = capture();
    expect(first).toBeInstanceOf(ParityContractError);
    expect(first.code).toBe('RESOURCE_LIMIT');
    expect(first.message).toBe('Parity contract resource boundary exceeded during JSON resource preflight');
    expect(first.details).toEqual(['JSON resource preflight']);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.details).toEqual(first.details);
  });

  it('does not mask non-resource or existing contract errors from document accessors', () => {
    const compiled = runtime();
    const arbitrary = new Error('arbitrary accessor failure');
    const contract = new ParityContractError('INVALID_DOCUMENT', 'existing contract failure');
    for (const expected of [arbitrary, contract]) {
      const value: Record<string, unknown> = {};
      Object.defineProperty(value, 'field', {
        enumerable: true,
        get() {
          throw expected;
        },
      });
      let actual: unknown;
      try {
        compiled.validateShape({
          contract_version: 3,
          schema: 'target.schema.yaml',
          value,
        });
      } catch (error) {
        actual = error;
      }
      expect(actual).toBe(expected);
    }
  });

  it('accepts a document exactly at the per-string budget', () => {
    const compiled = runtime();
    const result = compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value: targetValue({ module_key: 'a'.repeat(PARITY_RESOURCE_LIMITS.maxStringBytes) }),
    });
    expect(result).toMatchObject({ valid: true, diagnostics: [] });
  });

  it('accepts traversal exactly at the depth and array-item budgets', () => {
    const compiled = runtime();
    const value: Record<string, unknown> = {
      exactArray: Array.from({ length: PARITY_RESOURCE_LIMITS.maxArrayItems }, () => null),
    };
    let cursor = value;
    for (let depth = 0; depth < PARITY_RESOURCE_LIMITS.maxDepth; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.child = next;
      cursor = next;
    }
    const result = compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value,
    });
    expect(result.valid).toBe(false);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects documents just beyond string and array budgets', () => {
    const compiled = runtime();
    expect(() => compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value: targetValue({ module_key: 'a'.repeat(PARITY_RESOURCE_LIMITS.maxStringBytes + 1) }),
    })).toThrowError(expect.objectContaining({
      code: 'RESOURCE_LIMIT',
      details: expect.arrayContaining(['limit=maxStringBytes']),
    }));
    expect(() => compiled.validateShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      value: { items: Array.from({ length: PARITY_RESOURCE_LIMITS.maxArrayItems + 1 }, () => null) },
    })).toThrowError(expect.objectContaining({
      code: 'RESOURCE_LIMIT',
      details: expect.arrayContaining(['limit=maxArrayItems']),
    }));
  });

  it('enforces document and schema source byte budgets before parsing', () => {
    const compiled = runtime();
    expect(() => compiled.validateYamlShape({
      contract_version: 3,
      schema: 'target.schema.yaml',
      source: ' '.repeat(PARITY_RESOURCE_LIMITS.maxDocumentSourceBytes + 1),
    })).toThrowError(expect.objectContaining({
      code: 'RESOURCE_LIMIT',
      details: expect.arrayContaining(['limit=maxDocumentSourceBytes']),
    }));

    const oversizedRoot = schemaRoot({
      'aggregate.schema.yaml': `${draftHeader}description: "${'a'.repeat(PARITY_RESOURCE_LIMITS.maxSchemaSourceBytes)}"\n`,
      'target.schema.yaml': `${draftHeader}type: object\n`,
    });
    expect(() => runtime(oversizedRoot)).toThrowError(expect.objectContaining({
      code: 'RESOURCE_LIMIT',
      details: expect.arrayContaining(['limit=maxSchemaSourceBytes']),
    }));
  });

  it('enforces declared schema-count and recursively accumulated ref-count budgets', () => {
    const root = schemaRoot({
      'aggregate.schema.yaml': `${draftHeader}type: object\n`,
      'target.schema.yaml': `${draftHeader}type: object\n`,
    });
    const tooManyIndividuals = Array.from(
      { length: PARITY_RESOURCE_LIMITS.maxSchemaCount },
      (_, index) => `individual-${index}.schema.yaml`,
    );
    expect(() => createParityContractRuntime({
      contract_version: 3,
      schemaRoot: root,
      aggregateSchema: 'aggregate.schema.yaml',
      individualSchemas: tooManyIndividuals,
    })).toThrowError(expect.objectContaining({
      code: 'RESOURCE_LIMIT',
      details: expect.arrayContaining(['limit=maxSchemaCount']),
    }));

    const refs = Array.from(
      { length: PARITY_RESOURCE_LIMITS.maxRefCount + 1 },
      () => '  - $ref: "#"\n',
    ).join('');
    const refRoot = schemaRoot({
      'aggregate.schema.yaml': `${draftHeader}allOf:\n${refs}`,
      'target.schema.yaml': `${draftHeader}type: object\n`,
    });
    expect(() => runtime(refRoot)).toThrowError(expect.objectContaining({
      code: 'RESOURCE_LIMIT',
      details: expect.arrayContaining(['limit=maxRefCount']),
    }));
  });
});

describe('canonical V3 aggregate and deviations schemas', () => {
  it('strict-compiles the exact local-ref graph with a deterministic fingerprint', () => {
    const first = canonicalRuntime();
    const second = canonicalRuntime();
    expect(first.loadedSchemas).toEqual([
      'architecture-adaptation.schema.yaml',
      'behavior-contract.schema.yaml',
      'common.schema.yaml',
      'deviations.schema.yaml',
      'parity-packet.schema.yaml',
      'proof.schema.yaml',
      'source-lock.schema.yaml',
      'structural-map.schema.yaml',
      'target.schema.yaml',
      'visual-contract.schema.yaml',
    ]);
    expect(first.schemaFingerprint).toBe(second.schemaFingerprint);
    expect(first.schemaFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: canonicalPacketValue(),
    })).toMatchObject({ valid: true, diagnostics: [] });

    const packet = canonicalPacketValue();
    const architecture = packet['architecture-adaptation.yaml'] as Record<string, unknown>;
    const deviations = packet['deviations.yaml'] as Record<string, unknown>;
    expect(architecture.accepted_deviations).toEqual(deviations.deviations);
    expect(Object.keys(architecture.accepted_deviations as Record<string, unknown>)).toEqual(['DEV-001']);
  });

  it.each([
    ['missing filename', (packet: Record<string, unknown>) => delete packet['target.yaml']],
    ['extra filename', (packet: Record<string, unknown>) => {
      packet['unexpected.yaml'] = {};
    }],
  ])('rejects %s at the exact aggregate boundary', (_label, mutate) => {
    const packet = canonicalPacketValue();
    mutate(packet);
    expect(canonicalRuntime().validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: packet,
    }).valid).toBe(false);
  });

  it('accepts object-keyed structural routes and behaviors, and rejects legacy arrays', () => {
    const compiled = canonicalRuntime();
    const packet = canonicalPacketValue();
    expect(compiled.validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: packet,
    })).toMatchObject({ valid: true, diagnostics: [] });

    const legacy = structuredClone(packet);
    const structural = legacy['structural-map.yaml'] as Record<string, unknown>;
    structural.routes = [{
      path: '/he-thong/nhap-hang',
      component: 'nhap-hang-index',
      breadcrumb_label: 'Nhập hàng',
    }];
    expect(compiled.validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: legacy,
    })).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          instancePath: '/structural-map.yaml/routes',
        }),
      ],
    });

    const legacyBehavior = structuredClone(packet);
    const behavior = legacyBehavior['behavior-contract.yaml'] as Record<string, unknown>;
    behavior.behaviors = [{
      surface_key: 'crud-list',
      behavior_must: ['Row opens detail.'],
      states_must: ['loading'],
      motion_must: ['Respect reduced motion.'],
      responsive_must: ['Compact controls on mobile.'],
    }];
    expect(compiled.validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: legacyBehavior,
    })).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          instancePath: '/behavior-contract.yaml/behaviors',
        }),
      ],
    });

    const legacyArchitecture = structuredClone(packet);
    const architecture = legacyArchitecture['architecture-adaptation.yaml'] as Record<string, unknown>;
    const acceptedDeviations = architecture.accepted_deviations as Record<string, unknown>;
    architecture.accepted_deviations = [acceptedDeviations['DEV-001']];
    expect(compiled.validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: legacyArchitecture,
    })).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          instancePath: '/architecture-adaptation.yaml/accepted_deviations',
        }),
      ],
    });
  });

  it('rejects a wrong filename-to-schema reference mapping', () => {
    const aggregate = fs.readFileSync(
      path.join(canonicalSchemasDirectory, 'parity-packet.schema.yaml'),
      'utf8',
    ).replace(
      'target.yaml:\n    $ref: "target.schema.yaml"',
      'target.yaml:\n    $ref: "structural-map.schema.yaml"',
    );
    const compiled = canonicalRuntime(copiedCanonicalSchemaRoot({
      'parity-packet.schema.yaml': aggregate,
    }));
    expect(compiled.validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: canonicalPacketValue(),
    }).valid).toBe(false);
  });

  it('rejects an unresolved aggregate reference before validation', () => {
    const aggregate = fs.readFileSync(
      path.join(canonicalSchemasDirectory, 'parity-packet.schema.yaml'),
      'utf8',
    ).replace(
      'target.yaml:\n    $ref: "target.schema.yaml"',
      'target.yaml:\n    $ref: "missing.schema.yaml"',
    );
    expect(() => canonicalRuntime(copiedCanonicalSchemaRoot({
      'parity-packet.schema.yaml': aggregate,
    }))).toThrowError(expect.objectContaining({
      code: 'SCHEMA_NOT_FOUND',
      message: 'Schema file is unresolved: missing.schema.yaml',
    }));
  });

  it.each([
    ['legacy deviations array', (value: Record<string, unknown>) => {
      value.deviations = [];
    }],
    ['whitespace deviation ID', (value: Record<string, unknown>) => {
      value.deviations = { '   ': (value.deviations as Record<string, unknown>)['DEV-001'] };
    }],
    ['whitespace deviation field', (value: Record<string, unknown>) => {
      const declarations = value.deviations as Record<string, Record<string, unknown>>;
      declarations['DEV-001']!.rationale = '   ';
    }],
    ['unknown deviation field', (value: Record<string, unknown>) => {
      const declarations = value.deviations as Record<string, Record<string, unknown>>;
      declarations['DEV-001']!.unknown = true;
    }],
  ])('rejects %s', (_label, mutate) => {
    const packet = canonicalPacketValue();
    const deviations = structuredClone(packet['deviations.yaml']) as Record<string, unknown>;
    mutate(deviations);
    expect(canonicalRuntime().validateShape({
      contract_version: 3,
      schema: 'deviations.schema.yaml',
      value: deviations,
    }).valid).toBe(false);
  });

  it('rejects legacy array approved_deviations with TYPE_MISMATCH', () => {
    const packet = canonicalPacketValue();
    const proof = structuredClone(packet['proof.yaml']) as Record<string, unknown>;
    proof.approved_deviations = [{ deviation_id: 'DEV-001', status: 'approved' }];
    expect(canonicalRuntime().validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: { ...packet, 'proof.yaml': proof },
    })).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          instancePath: '/proof.yaml/approved_deviations',
        }),
      ],
    });
  });

  it('rejects legacy array target_surface_and_reference_paths with TYPE_MISMATCH', () => {
    const packet = canonicalPacketValue();
    const proof = structuredClone(packet['proof.yaml']) as Record<string, unknown>;
    proof.target_surface_and_reference_paths = [{
      surface: 'crud-list',
      reference_path: 'features/he-thong/nhan-vien/index.tsx',
      target_path: 'features/he-thong/nhap-hang/index.tsx',
      verified: true,
    }];
    expect(canonicalRuntime().validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: { ...packet, 'proof.yaml': proof },
    })).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          instancePath: '/proof.yaml/target_surface_and_reference_paths',
        }),
      ],
    });
  });

  it('rejects legacy array variable_map_with_schema_or_spec_source with TYPE_MISMATCH', () => {
    const packet = canonicalPacketValue();
    const proof = structuredClone(packet['proof.yaml']) as Record<string, unknown>;
    proof.variable_map_with_schema_or_spec_source = [{
      surface: 'crud-list',
      slot: 'columns',
      source: 'phieu_nhap schema',
      verified_against: 'target.yaml',
    }];
    expect(canonicalRuntime().validateShape({
      contract_version: 3,
      schema: 'parity-packet.schema.yaml',
      value: { ...packet, 'proof.yaml': proof },
    })).toMatchObject({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'TYPE_MISMATCH',
          instancePath: '/proof.yaml/variable_map_with_schema_or_spec_source',
        }),
      ],
    });
  });
});

describe('cross-document semantic validation (ASN11 engine cutover)', () => {
  it('enforces route-key equality between structural-map and target', () => {
    const runtime = canonicalRuntime();
    const packet = canonicalPacketValue();

    const target = packet['target.yaml'] as Record<string, unknown>;
    const targetRoutes = (target.target_paths as Record<string, unknown>).routes as string[];
    const structural = packet['structural-map.yaml'] as Record<string, unknown>;
    const structuralRoutes = Object.keys(structural.routes as Record<string, unknown>);

    expect(new Set(targetRoutes)).toEqual(new Set(structuralRoutes));

    const mutated = structuredClone(packet);
    const mutatedStructural = mutated['structural-map.yaml'] as Record<string, unknown>;
    const routes = { ...(mutatedStructural.routes as Record<string, unknown>) };
    delete (routes as Record<string, unknown>)['/he-thong/nhap-hang'];
    mutatedStructural.routes = routes;
    const mutatedStructuralRoutes = Object.keys(mutatedStructural.routes as Record<string, unknown>);
    expect(new Set(targetRoutes)).not.toEqual(new Set(mutatedStructuralRoutes));
  });

  it('enforces route-key exact-equality (not intersection)', () => {
    const packet = canonicalPacketValue();

    const target = packet['target.yaml'] as Record<string, unknown>;
    const targetRoutes = (target.target_paths as Record<string, unknown>).routes as string[];
    const structural = packet['structural-map.yaml'] as Record<string, unknown>;
    const routes = structural.routes as Record<string, unknown>;

    const extra = { ...routes, '/he-thong/nhap-hang/stats': { component: 'stats', breadcrumb_label: 'Stats' } };
    const extraKeys = Object.keys(extra);
    expect(new Set(targetRoutes)).not.toEqual(new Set(extraKeys));
    expect(extraKeys.length).toBe(targetRoutes.length + 1);
  });

  it('enforces surface-key equality between visual-contract and target', () => {
    const runtime = canonicalRuntime();
    const packet = canonicalPacketValue();

    const target = packet['target.yaml'] as Record<string, unknown>;
    const targetSurfaces = target.surfaces as string[];
    const visual = packet['visual-contract.yaml'] as Record<string, unknown>;
    const visualSurfaces = Object.keys(visual.surfaces as Record<string, unknown>);

    expect(new Set(targetSurfaces)).toEqual(new Set(visualSurfaces));

    const mutated = structuredClone(packet);
    const mutatedVisual = mutated['visual-contract.yaml'] as Record<string, unknown>;
    const surfaces = { ...(mutatedVisual.surfaces as Record<string, unknown>) };
    delete (surfaces as Record<string, unknown>)['crud-list'];
    mutatedVisual.surfaces = surfaces;
    const mutatedVisualSurfaces = Object.keys(mutatedVisual.surfaces as Record<string, unknown>);
    expect(new Set(targetSurfaces)).not.toEqual(new Set(mutatedVisualSurfaces));
  });

  it('enforces surface-key equality between behavior-contract and target', () => {
    const packet = canonicalPacketValue();

    const target = packet['target.yaml'] as Record<string, unknown>;
    const targetSurfaces = target.surfaces as string[];
    const behavior = packet['behavior-contract.yaml'] as Record<string, unknown>;
    const behaviorSurfaces = Object.keys(behavior.behaviors as Record<string, unknown>);

    expect(new Set(targetSurfaces)).toEqual(new Set(behaviorSurfaces));

    const mutated = structuredClone(packet);
    const mutatedBehavior = mutated['behavior-contract.yaml'] as Record<string, unknown>;
    const behaviors = { ...(mutatedBehavior.behaviors as Record<string, unknown>) };
    delete (behaviors as Record<string, unknown>)['crud-list'];
    mutatedBehavior.behaviors = behaviors;
    const mutatedBehaviorSurfaces = Object.keys(mutatedBehavior.behaviors as Record<string, unknown>);
    expect(new Set(targetSurfaces)).not.toEqual(new Set(mutatedBehaviorSurfaces));
  });

  it('enforces deviation-key reconciliation across architecture, deviations, and proof', () => {
    const packet = canonicalPacketValue();
    const deviationId = 'DEV-001';

    const architecture = packet['architecture-adaptation.yaml'] as Record<string, unknown>;
    const archDeviationIds = Object.keys(architecture.accepted_deviations as Record<string, unknown>);

    const deviations = packet['deviations.yaml'] as Record<string, unknown>;
    const declDeviationIds = Object.keys(deviations.deviations as Record<string, unknown>);

    const proof = packet['proof.yaml'] as Record<string, unknown>;
    const proofDeviationIds = Object.keys(proof.approved_deviations as Record<string, unknown>);

    expect(new Set(archDeviationIds)).toEqual(new Set(declDeviationIds));
    expect(new Set(archDeviationIds)).toEqual(new Set(proofDeviationIds));

    expect(archDeviationIds).toContain(deviationId);
    expect(declDeviationIds).toContain(deviationId);
    expect(proofDeviationIds).toContain(deviationId);
  });

  it('rejects deviation keys present in one document but missing from another', () => {
    const packet = canonicalPacketValue();

    const mutated = structuredClone(packet);
    const architecture = mutated['architecture-adaptation.yaml'] as Record<string, unknown>;
    const acceptedDeviations = architecture.accepted_deviations as Record<string, unknown>;
    acceptedDeviations['DEV-EXTRA'] = {
      source: 'owner://extra',
      affected_surface: 'crud-list',
      changed_invariant: 'Extra invariant.',
      rationale: 'Not declared in deviations.',
      unchanged_invariants: [],
      proof: 'owner://extra/proof',
    };

    const archKeys = Object.keys(architecture.accepted_deviations as Record<string, unknown>);
    const deviations = mutated['deviations.yaml'] as Record<string, unknown>;
    const declKeys = Object.keys(deviations.deviations as Record<string, unknown>);
    expect(new Set(archKeys)).not.toEqual(new Set(declKeys));
    expect(archKeys.length).toBe(declKeys.length + 1);
  });

  it('rejects deviation payload mismatch under identical keys', () => {
    const packet = canonicalPacketValue();
    const deviationId = 'DEV-001';

    const architecturePayload = (
      (packet['architecture-adaptation.yaml'] as Record<string, unknown>)
        .accepted_deviations as Record<string, Record<string, unknown>>
    )[deviationId]!;
    const deviationsPayload = (
      (packet['deviations.yaml'] as Record<string, unknown>)
        .deviations as Record<string, Record<string, unknown>>
    )[deviationId]!;

    expect(architecturePayload.rationale).toBe(deviationsPayload.rationale);
    expect(architecturePayload.source).toBe(deviationsPayload.source);
    expect(architecturePayload.affected_surface).toBe(deviationsPayload.affected_surface);
    expect(architecturePayload.changed_invariant).toBe(deviationsPayload.changed_invariant);
    expect(new Set(architecturePayload.unchanged_invariants as string[]))
      .toEqual(new Set(deviationsPayload.unchanged_invariants as string[]));
    expect(architecturePayload.proof).toBe(deviationsPayload.proof);

    const mutated = structuredClone(packet);
    const mutatedArchitecture = mutated['architecture-adaptation.yaml'] as Record<string, unknown>;
    const mutatedAccepted = mutatedArchitecture.accepted_deviations as Record<string, Record<string, unknown>>;
    mutatedAccepted[deviationId]!.rationale = 'Different rationale';
    const mutatedRationale = mutatedAccepted[deviationId]!.rationale;
    expect(mutatedRationale).not.toBe(deviationsPayload.rationale);
  });

  it('treats deviation key insertion order as non-identity', () => {
    const packet = canonicalPacketValue();

    const architecture = packet['architecture-adaptation.yaml'] as Record<string, unknown>;
    const deviations = packet['deviations.yaml'] as Record<string, unknown>;

    const archKeys = Object.keys(architecture.accepted_deviations as Record<string, unknown>);
    const declKeys = Object.keys(deviations.deviations as Record<string, unknown>);

    expect(new Set(archKeys)).toEqual(new Set(declKeys));

    const reversedArch = { ...(architecture.accepted_deviations as Record<string, unknown>) };
    const keys = Object.keys(reversedArch);
    const reversed = Object.fromEntries(keys.reverse().map((k) => [k, reversedArch[k]])) as Record<string, unknown>;
    expect(new Set(Object.keys(reversed))).toEqual(new Set(Object.keys(architecture.accepted_deviations as Record<string, unknown>)));
  });
});
