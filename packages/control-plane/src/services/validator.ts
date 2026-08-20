import { Ajv, type ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });

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

const modelPolicySchema = {
  type: 'object',
  required: ['version', 'platforms'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    platforms: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          defaultModel: { type: 'string' },
          models: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                provider: { type: 'string' },
                model: { type: 'string' },
                maxTokens: { type: 'integer' },
                temperature: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
};

const triggerAuditArraySchema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['phrase'],
    properties: {
      phrase: { type: 'string', minLength: 1 },
      skill: { type: 'string' },
      file: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
    },
  },
};

const registrySchema = {
  type: 'object',
  required: ['version', 'integrations'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    integrations: {
      type: 'array',
      items: {
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
      },
    },
  },
};

const profilesManifestSchema = {
  type: 'object',
  required: ['version'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    profiles: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          displayName: { type: 'string' },
          description: { type: 'string' },
          enabledByDefault: { type: 'boolean' },
          rules: { type: 'array', items: { type: 'string' } },
        },
      },
    },
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
  'model-policy': ajv.compile(modelPolicySchema),
  'trigger-audit-array': ajv.compile(triggerAuditArraySchema),
  registry: ajv.compile(registrySchema),
  'profiles-manifest': ajv.compile(profilesManifestSchema),
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
    'automation/model-policy.json': modelPolicySchema,
    'automation/trigger-audit.json': triggerAuditArraySchema,
    'integrations/registry.json': registrySchema,
    'profiles/manifest.yaml': profilesManifestSchema,
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
