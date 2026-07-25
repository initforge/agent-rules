import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true, verbose: true });

const profileManifestSchema: JSONSchemaType<{ version: number; profiles: Record<string, { enabledByDefault?: boolean }> }> = {
  type: 'object',
  required: ['version', 'profiles'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    profiles: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          enabledByDefault: { type: 'boolean', nullable: true },
          name: { type: 'string' },
          displayName: { type: 'string' },
        },
        required: [],
      },
    },
  },
};

const integrationSchema: JSONSchemaType<{
  id: string;
  kind?: string;
  policy?: string;
  source?: { type?: string; version?: string };
}> = {
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

const triggerAuditSchema: JSONSchemaType<{
  phrase: string;
  skill?: string;
  keywords?: string[];
}> = {
  type: 'object',
  required: ['phrase'],
  properties: {
    phrase: { type: 'string', minLength: 1 },
    skill: { type: 'string' },
    file: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' }, nullable: true },
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
    errors: valid ? [] : (validate.errors || []).map(e => `${e.instancePath} ${e.message}`),
  };
}

export function validateAgainstSchema(filePath: string, data: unknown): ValidationResult {
  const schemaMap: Record<string, JSONSchemaType<unknown>> = {
    'automation/model-policy.json': {
      type: 'object',
      required: ['version', 'platforms'],
      properties: {
        version: { type: 'integer' },
        platforms: { type: 'object' },
      },
    } as JSONSchemaType<unknown>,
    'automation/trigger-audit.json': {
      type: 'array',
      items: { type: 'object', required: ['phrase'], properties: { phrase: { type: 'string' } } },
    } as JSONSchemaType<unknown>,
    'integrations/registry.json': {
      type: 'object',
      required: ['version', 'integrations'],
      properties: {
        version: { type: 'integer' },
        integrations: { type: 'array', items: { type: 'object', required: ['id'] } },
      },
    } as JSONSchemaType<unknown>,
  };

  const schema = schemaMap[filePath];
  if (!schema) return { valid: true, errors: [] };

  const validate = ajv.compile(schema);
  const valid = validate(data) as boolean;
  return {
    valid,
    errors: valid ? [] : (validate.errors || []).map(e => `${e.instancePath} ${e.message}`),
  };
}
