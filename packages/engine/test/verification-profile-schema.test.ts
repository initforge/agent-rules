import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(here, '..', '..', '..', 'schemas', 'verification-profile.schema.json');
const rawSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(rawSchema);

describe('verification-profile.schema.json (canonical contract)', () => {
  it('accepts a flat shell-string[] style (the historical runner contract)', () => {
    // The schema is for the structured object; the runner also accepts a
    // flat string[] and lifts it to a single-shell-step profile internally.
    // That mapping is NOT the schema's job — the schema is what an operator
    // writing a structured profile submits to the runner.
    const profile = {
      steps: [{ kind: 'shell', command: 'npm run check' }],
      evidence: [],
    };
    expect(validate(profile)).toBe(true);
  });

  it('accepts a playwright step with headed + tabProfile', () => {
    const profile = {
      steps: [
        {
          kind: 'playwright',
          spec: 'tests/ui/button.spec.ts',
          baseUrl: 'http://localhost:3000',
          headed: true,
          tabProfile: 'task-7',
        },
      ],
      evidence: ['screenshot', 'console'],
    };
    expect(validate(profile)).toBe(true);
  });

  it('accepts an mcp-tool-call step referencing a registered MCP server', () => {
    const profile = {
      steps: [
        { kind: 'mcp-tool-call', server: 'chrome-devtools-mcp', tool: 'list_console_messages', args: { since: 'load' } },
      ],
      evidence: ['mcp-response'],
    };
    expect(validate(profile)).toBe(true);
  });

  it('accepts a visual-diff step with threshold in [0, 1]', () => {
    const profile = {
      steps: [
        { kind: 'visual-diff', baseline: 'snapshots/before.png', current: 'snapshots/after.png', threshold: 0.05 },
      ],
      evidence: [],
    };
    expect(validate(profile)).toBe(true);
  });

  it('accepts a browser-script step with no extra options', () => {
    const profile = {
      steps: [{ kind: 'browser-script', path: 'scripts/visual-check.mjs' }],
      evidence: [],
    };
    expect(validate(profile)).toBe(true);
  });

  it('rejects an unknown step kind', () => {
    const profile = {
      steps: [{ kind: 'lol', x: 1 }],
      evidence: [],
    };
    expect(validate(profile)).toBe(false);
    if (!validate(profile)) {
      expect(validate.errors?.some((e) => /oneOf|kind|enum/i.test(String(e.message ?? '')))).toBe(true);
    }
  });

  it('rejects an empty steps array', () => {
    const profile = { steps: [], evidence: [] };
    expect(validate(profile)).toBe(false);
  });

  it('rejects a shell step with an empty command', () => {
    const profile = { steps: [{ kind: 'shell', command: '' }], evidence: [] };
    expect(validate(profile)).toBe(false);
  });

  it('rejects an evidence kind outside the closed enum', () => {
    const profile = {
      steps: [{ kind: 'shell', command: 'x' }],
      evidence: ['screenshot', 'video'],
    };
    expect(validate(profile)).toBe(false);
  });

  it('rejects a threshold outside [0, 1] for visual-diff', () => {
    const profile = {
      steps: [{ kind: 'visual-diff', baseline: 'a', current: 'b', threshold: 1.5 }],
      evidence: [],
    };
    expect(validate(profile)).toBe(false);
  });

  it('rejects a non-object profile', () => {
    expect(validate('hello' as unknown)).toBe(false);
  });

  it('rejects a profile missing required evidence array', () => {
    const profile = { steps: [{ kind: 'shell', command: 'x' }] };
    expect(validate(profile)).toBe(false);
  });
});