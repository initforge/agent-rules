import { Ajv, type ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true, verbose: true });

const profileManifestSchema = {
  type: 'object',
  required: ['version', 'profiles'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    profiles: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          enabledByDefault: { type: 'boolean' },
          name: { type: 'string' },
          displayName: { type: 'string' },
        },
        required: [],
      },
    },
  },
};

const integrationSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { type: 'string' },
    policy: { type: 'string', enum: ['required', 'recommended', 'optional'] },
    source: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        version: { type: 'string' },
      },
    },
  },
};

const triggerAuditSchema = {
  type: 'object',
  required: ['phrase'],
  properties: {
    phrase: { type: 'string', minLength: 1 },
    skill: { type: 'string' },
    file: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
  },
};

export type EditTarget = 'profile-enabled' | 'trigger-audit' | 'integration';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const validators: Record<string, ValidateFunction> = {
  'profile-enabled': ajv.compile(profileManifestSchema),
  'trigger-audit': ajv.compile(triggerAuditSchema),
  integration: ajv.compile(integrationSchema),
};

export function validateEdit(target: EditTarget, data: unknown): ValidationResult {
  const validate = validators[target];
  if (!validate) {
    return { valid: false, errors: [`Unknown edit target: ${target}`] };
  }
  const valid = validate(data) as boolean;
  return {
    valid,
    errors: valid ? [] : (validate.errors || []).map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`),
  };
}

export function validateAgainstSchema(filePath: string, data: unknown): ValidationResult {
  const schemaMap: Record<string, Record<string, unknown>> = {
    'automation/model-policy.json': {
      type: 'object',
      required: ['version', 'platforms'],
      properties: {
        version: { type: 'integer' },
        platforms: { type: 'object' },
      },
    },
    'automation/trigger-audit.json': {
      type: 'array',
      items: { type: 'object', required: ['phrase'], properties: { phrase: { type: 'string' } } },
    },
    'integrations/registry.json': {
      type: 'object',
      required: ['version', 'integrations'],
      properties: {
        version: { type: 'integer' },
        integrations: { type: 'array', items: { type: 'object', required: ['id'] } },
      },
    },
  };

  const schema = schemaMap[filePath];
  if (!schema) return { valid: true, errors: [] };

  const validate = ajv.compile(schema);
  const valid = validate(data) as boolean;
  return {
    valid,
    errors: valid ? [] : (validate.errors || []).map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`),
  };
}
