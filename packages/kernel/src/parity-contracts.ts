import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { isScalar, parseDocument, visit } from 'yaml';

export const PARITY_CONTRACT_VERSION = 3 as const;
export const DRAFT_07_SCHEMA_URI = 'http://json-schema.org/draft-07/schema#' as const;

export const PARITY_RESOURCE_LIMITS = Object.freeze({
  maxSchemaCount: 128,
  maxRefCount: 2_048,
  maxSchemaSourceBytes: 512 * 1_024,
  maxTotalSchemaSourceBytes: 4 * 1_024 * 1_024,
  maxDocumentSourceBytes: 512 * 1_024,
  maxDepth: 128,
  maxNodeCount: 50_000,
  maxGraphNodeCount: 200_000,
  maxStringBytes: 256 * 1_024,
  maxAggregateStringBytes: 4 * 1_024 * 1_024,
  maxArrayItems: 10_000,
  maxObjectProperties: 10_000,
  maxDiagnostics: 1_000,
  maxYamlAliases: 0,
  maxCanonicalDepth: 136,
  maxCanonicalNodeCount: 250_000,
  maxCanonicalStringBytes: 8 * 1_024 * 1_024,
  maxCanonicalBytes: 8 * 1_024 * 1_024,
} as const);

export type ParityDiagnosticCode =
  | 'UNKNOWN_FIELD'
  | 'MISSING_FIELD'
  | 'TYPE_MISMATCH'
  | 'ENUM_MISMATCH'
  | 'CONST_MISMATCH'
  | 'SCHEMA_VIOLATION'
  | 'DUPLICATE_YAML_KEY'
  | 'YAML_PARSE_ERROR';

export type ParityContractErrorCode =
  | 'UNSUPPORTED_CONTRACT_VERSION'
  | 'INVALID_SCHEMA_ROOT'
  | 'INVALID_SCHEMA_PATH'
  | 'SCHEMA_SYMLINK_REJECTED'
  | 'SCHEMA_NOT_FOUND'
  | 'SCHEMA_PARSE_FAILED'
  | 'DUPLICATE_YAML_KEY'
  | 'UNSUPPORTED_SCHEMA_DRAFT'
  | 'DUPLICATE_SCHEMA_ID'
  | 'NESTED_SCHEMA_ID_UNSUPPORTED'
  | 'REMOTE_REF_REJECTED'
  | 'UNRESOLVED_SCHEMA_REF'
  | 'SCHEMA_COMPILE_FAILED'
  | 'SCHEMA_NOT_COMPILED'
  | 'INVALID_DOCUMENT'
  | 'RESOURCE_LIMIT';

export interface ParityDiagnostic {
  readonly code: ParityDiagnosticCode;
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly message: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface ParityShapeValidationResult {
  readonly contract_version: typeof PARITY_CONTRACT_VERSION;
  readonly schema: string;
  readonly valid: boolean;
  readonly diagnostics: readonly ParityDiagnostic[];
  readonly schemaFingerprint: string;
  readonly fingerprint: string;
}

export interface ParityShapeValidationRequest {
  readonly contract_version: number;
  readonly schema: string;
  readonly value: unknown;
}

export interface ParityYamlValidationRequest {
  readonly contract_version: number;
  readonly schema: string;
  readonly source: string;
}

export interface ParityContractRuntimeOptions {
  readonly contract_version: number;
  readonly schemaRoot: string;
  readonly aggregateSchema: string;
  readonly individualSchemas: readonly string[];
}

export interface ParityContractRuntime {
  readonly contract_version: typeof PARITY_CONTRACT_VERSION;
  readonly aggregateSchema: string;
  readonly individualSchemas: readonly string[];
  readonly loadedSchemas: readonly string[];
  readonly schemaFingerprint: string;
  validateShape(request: ParityShapeValidationRequest): ParityShapeValidationResult;
  validateYamlShape(request: ParityYamlValidationRequest): ParityShapeValidationResult;
}

const ERROR_TEXT_LIMIT = 1_024;
const ERROR_DETAIL_LIMIT = 64;

function boundedErrorText(value: unknown): string {
  const text = typeof value === 'string' ? value : String(value);
  return text.length <= ERROR_TEXT_LIMIT ? text : `${text.slice(0, ERROR_TEXT_LIMIT)}…`;
}

export class ParityContractError extends Error {
  readonly code: ParityContractErrorCode;
  readonly details: readonly string[];
  readonly fingerprint: string;

  constructor(code: ParityContractErrorCode, message: string, details: readonly string[] = []) {
    const boundedMessage = boundedErrorText(message);
    super(boundedMessage);
    this.name = 'ParityContractError';
    this.code = code;
    this.details = details.slice(0, ERROR_DETAIL_LIMIT).map(boundedErrorText).sort();
    this.fingerprint = sha256(JSON.stringify([code, boundedMessage, this.details]));
  }
}

type JsonObject = Record<string, unknown>;

interface LoadedSchema {
  readonly relativePath: string;
  readonly schema: JsonObject;
}

interface JsonMetrics {
  readonly nodeCount: number;
  readonly stringBytes: number;
}

interface JsonBudget {
  readonly nodeLimit: number;
  readonly nodeLimitName: keyof typeof PARITY_RESOURCE_LIMITS;
  readonly depthLimit: number;
  readonly depthLimitName: keyof typeof PARITY_RESOURCE_LIMITS;
  readonly aggregateStringLimit: number;
  readonly aggregateStringLimitName: keyof typeof PARITY_RESOURCE_LIMITS;
}

interface SchemaMetadata {
  readonly id?: string;
  readonly externalRefs: readonly string[];
  readonly refCount: number;
}

const SCHEMA_FILE_EXTENSION = /\.(?:json|ya?ml)$/i;
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/;
const WINDOWS_ILLEGAL_SEGMENT_CHARACTERS = /[<>:"|?*]/;
const ASCII_PRINTABLE = /^[\x20-\x7e]+$/;
const WINDOWS_RESERVED_DEVICE =
  /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const VIRTUAL_SCHEMA_ROOT = 'https://parity-schema.invalid/';
const YAML_MERGE_TAG = 'tag:yaml.org,2002:merge';
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function fail(code: ParityContractErrorCode, message: string, details: readonly string[] = []): never {
  throw new ParityContractError(code, message, details);
}

function resourceLimit(limit: keyof typeof PARITY_RESOURCE_LIMITS, actual?: number): never {
  const details = [
    `limit=${limit}`,
    `maximum=${PARITY_RESOURCE_LIMITS[limit]}`,
    ...(actual === undefined ? [] : [`actual=${actual}`]),
  ];
  return fail('RESOURCE_LIMIT', `Parity contract resource limit exceeded: ${limit}`, details);
}

function isRuntimeResourceFailure(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /allocation failed|heap out of memory|maximum call stack|too much recursion/i.test(message);
}

function withResourceBoundary<T>(operation: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ParityContractError) throw error;
    if (isRuntimeResourceFailure(error)) {
      fail('RESOURCE_LIMIT', `Parity contract resource boundary exceeded during ${operation}`, [operation]);
    }
    throw error;
  }
}

const DOCUMENT_JSON_BUDGET: JsonBudget = {
  nodeLimit: PARITY_RESOURCE_LIMITS.maxNodeCount,
  nodeLimitName: 'maxNodeCount',
  depthLimit: PARITY_RESOURCE_LIMITS.maxDepth,
  depthLimitName: 'maxDepth',
  aggregateStringLimit: PARITY_RESOURCE_LIMITS.maxAggregateStringBytes,
  aggregateStringLimitName: 'maxAggregateStringBytes',
};

const CANONICAL_JSON_BUDGET: JsonBudget = {
  nodeLimit: PARITY_RESOURCE_LIMITS.maxCanonicalNodeCount,
  nodeLimitName: 'maxCanonicalNodeCount',
  depthLimit: PARITY_RESOURCE_LIMITS.maxCanonicalDepth,
  depthLimitName: 'maxCanonicalDepth',
  aggregateStringLimit: PARITY_RESOURCE_LIMITS.maxCanonicalStringBytes,
  aggregateStringLimitName: 'maxCanonicalStringBytes',
};

function preflightJsonUnsafe(value: unknown, budget: JsonBudget): JsonMetrics {
  type Frame = { readonly value: unknown; readonly depth: number; readonly exit?: boolean };
  const stack: Frame[] = [{ value, depth: 0 }];
  const ancestors = new WeakSet<object>();
  let nodeCount = 0;
  let stringBytes = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    if (frame.exit) {
      ancestors.delete(frame.value as object);
      continue;
    }
    nodeCount += 1;
    if (nodeCount > budget.nodeLimit) {
      resourceLimit(budget.nodeLimitName, nodeCount);
    }
    if (frame.depth > budget.depthLimit) {
      resourceLimit(budget.depthLimitName, frame.depth);
    }
    if (frame.value === null || typeof frame.value === 'boolean') continue;
    if (typeof frame.value === 'number') {
      if (!Number.isFinite(frame.value)) {
        fail('INVALID_DOCUMENT', 'Documents must contain finite JSON numbers');
      }
      continue;
    }
    if (typeof frame.value === 'string') {
      const bytes = Buffer.byteLength(frame.value, 'utf8');
      if (bytes > PARITY_RESOURCE_LIMITS.maxStringBytes) resourceLimit('maxStringBytes', bytes);
      stringBytes += bytes;
      if (stringBytes > budget.aggregateStringLimit) {
        resourceLimit(budget.aggregateStringLimitName, stringBytes);
      }
      continue;
    }
    if (typeof frame.value !== 'object') {
      fail('INVALID_DOCUMENT', 'Documents must be JSON-compatible');
    }
    if (ancestors.has(frame.value)) {
      fail('INVALID_DOCUMENT', 'Documents must not contain object cycles');
    }
    ancestors.add(frame.value);
    stack.push({ value: frame.value, depth: frame.depth, exit: true });

    if (Array.isArray(frame.value)) {
      if (frame.value.length > PARITY_RESOURCE_LIMITS.maxArrayItems) {
        resourceLimit('maxArrayItems', frame.value.length);
      }
      for (let index = frame.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: frame.value[index], depth: frame.depth + 1 });
      }
      continue;
    }

    const prototype = Object.getPrototypeOf(frame.value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail('INVALID_DOCUMENT', 'Documents must contain only plain JSON objects');
    }
    const record = frame.value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record);
    if (keys.length > PARITY_RESOURCE_LIMITS.maxObjectProperties) {
      resourceLimit('maxObjectProperties', keys.length);
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const bytes = Buffer.byteLength(key, 'utf8');
      if (bytes > PARITY_RESOURCE_LIMITS.maxStringBytes) resourceLimit('maxStringBytes', bytes);
      stringBytes += bytes;
      if (stringBytes > budget.aggregateStringLimit) {
        resourceLimit(budget.aggregateStringLimitName, stringBytes);
      }
      stack.push({ value: record[key], depth: frame.depth + 1 });
    }
  }

  return { nodeCount, stringBytes };
}

function preflightJson(value: unknown, budget: JsonBudget = DOCUMENT_JSON_BUDGET): JsonMetrics {
  return withResourceBoundary('JSON resource preflight', () => preflightJsonUnsafe(value, budget));
}

function canonicalJsonUnsafe(value: unknown, stack = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  const object = value as object;
  stack.add(object);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJsonUnsafe(item, stack)).join(',')}]`;
    }
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonUnsafe(record[key], stack)}`)
      .join(',')}}`;
  } finally {
    stack.delete(object);
  }
}

function canonicalJson(value: unknown): string {
  preflightJson(value, CANONICAL_JSON_BUDGET);
  return withResourceBoundary('canonical fingerprint serialization', () => {
    const canonical = canonicalJsonUnsafe(value);
    const bytes = Buffer.byteLength(canonical, 'utf8');
    if (bytes > PARITY_RESOURCE_LIMITS.maxCanonicalBytes) resourceLimit('maxCanonicalBytes', bytes);
    return canonical;
  });
}

function assertContractVersion(version: number): asserts version is typeof PARITY_CONTRACT_VERSION {
  if (version !== PARITY_CONTRACT_VERSION) {
    fail('UNSUPPORTED_CONTRACT_VERSION', `Parity contract_version must be ${PARITY_CONTRACT_VERSION}`);
  }
}

function asciiCaseFold(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function normalizePortableSegments(value: string, field: string): readonly string[] {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    fail('INVALID_SCHEMA_PATH', `${field} must be a canonical non-empty relative path`);
  }
  if (value !== value.normalize('NFC') || !ASCII_PRINTABLE.test(value)) {
    fail('INVALID_SCHEMA_PATH', `${field} must use printable ASCII in NFC form`, [value]);
  }
  if (
    value.includes('\\') ||
    value.includes('%') ||
    value.includes('#') ||
    URI_SCHEME.test(value) ||
    WINDOWS_DRIVE_PATH.test(value) ||
    value.startsWith('/') ||
    value.startsWith('//')
  ) {
    fail('INVALID_SCHEMA_PATH', `${field} must remain inside the portable schema namespace`, [value]);
  }
  const segments = value.split('/');
  for (const segment of segments) {
    if (
      segment.length === 0 ||
      segment === '.' ||
      segment === '..' ||
      segment !== segment.trim() ||
      segment.endsWith('.') ||
      segment.endsWith(' ') ||
      WINDOWS_ILLEGAL_SEGMENT_CHARACTERS.test(segment) ||
      WINDOWS_RESERVED_DEVICE.test(segment)
    ) {
      fail('INVALID_SCHEMA_PATH', `${field} contains a non-portable path segment`, [value, segment]);
    }
  }
  return segments;
}

function normalizeSchemaPath(value: string, field: string): string {
  const segments = normalizePortableSegments(value, field);
  if (!SCHEMA_FILE_EXTENSION.test(segments.at(-1) ?? '')) {
    fail('INVALID_SCHEMA_PATH', `${field} must reference a JSON or YAML schema`, [value]);
  }
  return segments.join('/');
}

function normalizeSchemaId(value: string, field: string): string {
  return normalizePortableSegments(value, field).join('/');
}

function canonicalPortableIdentity(value: string): string {
  return asciiCaseFold(value.normalize('NFC'));
}

function registerPortableIdentity(
  registry: Map<string, string>,
  value: string,
  code: 'INVALID_SCHEMA_PATH' | 'DUPLICATE_SCHEMA_ID',
  description: string,
  allowExactRepeat = true,
): void {
  const key = canonicalPortableIdentity(value);
  const existing = registry.get(key);
  if (existing !== undefined && (!allowExactRepeat || existing !== value)) {
    fail(code, `${description} collides under portable case-folding`, [existing, value]);
  }
  registry.set(key, value);
}

function normalizeDeclaredSchemas(aggregateSchema: string, individualSchemas: readonly string[]): {
  aggregateSchema: string;
  individualSchemas: readonly string[];
} {
  const aggregate = normalizeSchemaPath(aggregateSchema, 'aggregateSchema');
  if (!Array.isArray(individualSchemas) || individualSchemas.length === 0) {
    fail('INVALID_SCHEMA_PATH', 'individualSchemas must declare at least one schema');
  }
  if (individualSchemas.length + 1 > PARITY_RESOURCE_LIMITS.maxSchemaCount) {
    resourceLimit('maxSchemaCount', individualSchemas.length + 1);
  }
  const individuals = individualSchemas.map((item) => normalizeSchemaPath(item, 'individualSchemas'));
  const registry = new Map<string, string>();
  for (const schemaPath of [aggregate, ...individuals]) {
    const key = canonicalPortableIdentity(schemaPath);
    if (registry.has(key)) {
      fail('INVALID_SCHEMA_PATH', 'Aggregate and individual schema paths must be unique', [
        registry.get(key) ?? '',
        schemaPath,
      ]);
    }
    registry.set(key, schemaPath);
  }
  return { aggregateSchema: aggregate, individualSchemas: individuals };
}

function resolveSchemaRoot(schemaRoot: string): string {
  if (typeof schemaRoot !== 'string' || schemaRoot.trim().length === 0) {
    fail('INVALID_SCHEMA_ROOT', 'schemaRoot must be a non-empty directory path');
  }
  const requestedRoot = path.resolve(schemaRoot);
  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(requestedRoot);
  } catch {
    return fail('INVALID_SCHEMA_ROOT', 'schemaRoot does not exist');
  }
  if (rootStat.isSymbolicLink()) fail('SCHEMA_SYMLINK_REJECTED', 'schemaRoot must not be a symbolic link');
  if (!rootStat.isDirectory()) fail('INVALID_SCHEMA_ROOT', 'schemaRoot must be a directory');
  return fs.realpathSync.native(requestedRoot);
}

function resolveSchemaFile(schemaRoot: string, relativePath: string): { readonly absolutePath: string; readonly size: number } {
  const segments = relativePath.split('/');
  let cursor = schemaRoot;
  let stat: fs.Stats | undefined;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    try {
      stat = fs.lstatSync(cursor);
    } catch {
      return fail('SCHEMA_NOT_FOUND', `Schema file is unresolved: ${relativePath}`);
    }
    if (stat.isSymbolicLink()) {
      fail('SCHEMA_SYMLINK_REJECTED', `Schema path contains a symbolic link: ${relativePath}`);
    }
  }
  const relative = path.relative(schemaRoot, cursor);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('INVALID_SCHEMA_PATH', `Schema path escapes the schema root: ${relativePath}`);
  }
  if (!stat?.isFile()) fail('SCHEMA_NOT_FOUND', `Schema path is not a file: ${relativePath}`);
  return { absolutePath: cursor, size: stat.size };
}

function scanYamlFlowDepth(source: string): void {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let comment = false;
  let flowDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (comment) {
      if (character === '\n' || character === '\r') comment = false;
      continue;
    }
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        quote = undefined;
      }
      continue;
    }
    if (quote === "'") {
      if (character === "'" && source[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '#' && (index === 0 || /\s/.test(source[index - 1] ?? ''))) {
      comment = true;
      continue;
    }
    if (character === '[' || character === '{') {
      flowDepth += 1;
      if (flowDepth > PARITY_RESOURCE_LIMITS.maxDepth) resourceLimit('maxDepth', flowDepth);
    } else if (character === ']' || character === '}') {
      flowDepth = Math.max(0, flowDepth - 1);
    }
  }
}

function assertSourceBudget(source: string, limit: 'maxSchemaSourceBytes' | 'maxDocumentSourceBytes'): number {
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes > PARITY_RESOURCE_LIMITS[limit]) resourceLimit(limit, bytes);
  scanYamlFlowDepth(source);
  return bytes;
}

function yamlNodeOffset(node: { readonly range?: readonly number[] | null }): string {
  return `offset=${node.range?.[0] ?? -1}`;
}

function assertYamlStructurePolicy(document: ReturnType<typeof parseDocument>): void {
  withResourceBoundary('YAML structural policy', () => {
    visit(document, {
      Alias(_key, node) {
        fail('RESOURCE_LIMIT', 'YAML aliases are disabled by the parity resource policy', [
          yamlNodeOffset(node),
        ]);
      },
      Node(_key, node) {
        if ('anchor' in node && typeof node.anchor === 'string') {
          fail('RESOURCE_LIMIT', 'YAML anchors are disabled by the parity resource policy', [
            yamlNodeOffset(node),
          ]);
        }
        if (node.tag === YAML_MERGE_TAG) {
          fail('RESOURCE_LIMIT', 'YAML merge tags are disabled by the parity resource policy', [
            yamlNodeOffset(node),
          ]);
        }
      },
      Pair(_key, pair) {
        const key = pair.key;
        if (isScalar(key) && ((key.type === 'PLAIN' && key.value === '<<') || key.tag === YAML_MERGE_TAG)) {
          fail('RESOURCE_LIMIT', 'YAML merge keys are disabled by the parity resource policy', [
            yamlNodeOffset(key),
          ]);
        }
      },
    });
  });
}

function canonicalDiagnostics(diagnostics: readonly ParityDiagnostic[]): readonly ParityDiagnostic[] {
  if (diagnostics.length > PARITY_RESOURCE_LIMITS.maxDiagnostics) {
    resourceLimit('maxDiagnostics', diagnostics.length);
  }
  return diagnostics
    .map((item) => ({
      ...item,
      params: JSON.parse(canonicalJson(item.params)) as Readonly<Record<string, unknown>>,
    }))
    .sort((left, right) => {
      const leftKey = canonicalJson(left);
      const rightKey = canonicalJson(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

function yamlDiagnostics(
  source: string,
  schemaPath: string,
  sourceLimit: 'maxSchemaSourceBytes' | 'maxDocumentSourceBytes',
): { readonly value?: unknown; readonly diagnostics: readonly ParityDiagnostic[] } {
  assertSourceBudget(source, sourceLimit);
  const document = withResourceBoundary('YAML parsing', () =>
    parseDocument(source, {
      logLevel: 'silent',
      merge: false,
      prettyErrors: false,
      schema: 'core',
      strict: true,
      uniqueKeys: true,
    }),
  );
  assertYamlStructurePolicy(document);
  const issues = [...document.errors, ...document.warnings];
  if (issues.length > PARITY_RESOURCE_LIMITS.maxDiagnostics) {
    resourceLimit('maxDiagnostics', issues.length);
  }
  const diagnostics = issues.map((issue): ParityDiagnostic => ({
    code: issue.code === 'DUPLICATE_KEY' ? 'DUPLICATE_YAML_KEY' : 'YAML_PARSE_ERROR',
    instancePath: '',
    schemaPath,
    keyword: 'yaml',
    message: boundedErrorText(issue.message),
    params: {
      issueCode: issue.code,
      position: [...issue.pos],
    },
  }));
  if (diagnostics.length > 0) return { diagnostics: canonicalDiagnostics(diagnostics) };
  try {
    const value = withResourceBoundary('YAML alias expansion', () =>
      document.toJS({ maxAliasCount: PARITY_RESOURCE_LIMITS.maxYamlAliases }),
    );
    preflightJson(value);
    return { value, diagnostics: [] };
  } catch (error) {
    if (error instanceof ParityContractError) throw error;
    if (isRuntimeResourceFailure(error) || /alias|anchor|merge/i.test(error instanceof Error ? error.message : String(error))) {
      fail('RESOURCE_LIMIT', 'YAML conversion exceeded the parity resource policy', [
        boundedErrorText(error instanceof Error ? error.message : String(error)),
      ]);
    }
    return {
      diagnostics: canonicalDiagnostics([
        {
          code: 'YAML_PARSE_ERROR',
          instancePath: '',
          schemaPath,
          keyword: 'yaml',
          message: boundedErrorText(error instanceof Error ? error.message : 'YAML conversion failed'),
          params: {},
        },
      ]),
    };
  }
}

function readSchema(
  schemaRoot: string,
  relativePath: string,
): { readonly schema: JsonObject; readonly sourceBytes: number; readonly nodeCount: number } {
  const resolved = resolveSchemaFile(schemaRoot, relativePath);
  if (resolved.size > PARITY_RESOURCE_LIMITS.maxSchemaSourceBytes) {
    resourceLimit('maxSchemaSourceBytes', resolved.size);
  }
  const source = withResourceBoundary('schema source read', () => {
    const buffer = fs.readFileSync(resolved.absolutePath);
    if (buffer.byteLength > PARITY_RESOURCE_LIMITS.maxSchemaSourceBytes) {
      resourceLimit('maxSchemaSourceBytes', buffer.byteLength);
    }
    try {
      return UTF8_DECODER.decode(buffer);
    } catch {
      return fail('SCHEMA_PARSE_FAILED', `Schema source is not valid UTF-8: ${relativePath}`);
    }
  });
  const sourceBytes = assertSourceBudget(source, 'maxSchemaSourceBytes');
  const parsed = yamlDiagnostics(source, relativePath, 'maxSchemaSourceBytes');
  if (parsed.diagnostics.length > 0) {
    const duplicate = parsed.diagnostics.some((item) => item.code === 'DUPLICATE_YAML_KEY');
    fail(
      duplicate ? 'DUPLICATE_YAML_KEY' : 'SCHEMA_PARSE_FAILED',
      duplicate ? `Schema contains a duplicate YAML key: ${relativePath}` : `Schema parsing failed: ${relativePath}`,
      parsed.diagnostics.map((item) => canonicalJson(item)),
    );
  }
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    fail('SCHEMA_PARSE_FAILED', `Schema root must be an object: ${relativePath}`);
  }
  const metrics = preflightJson(parsed.value);
  return { schema: parsed.value as JsonObject, sourceBytes, nodeCount: metrics.nodeCount };
}

function collectSchemaMetadata(schema: JsonObject, relativePath: string): SchemaMetadata {
  if (schema.$schema !== DRAFT_07_SCHEMA_URI) {
    fail('UNSUPPORTED_SCHEMA_DRAFT', `Schema must declare Draft-07: ${relativePath}`);
  }
  let rootId: string | undefined;
  let refCount = 0;
  const externalRefs = new Set<string>();
  const stack: Array<{ readonly value: unknown; readonly pointer: string }> = [{ value: schema, pointer: '#' }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame || !frame.value || typeof frame.value !== 'object') continue;
    if (Array.isArray(frame.value)) {
      for (let index = frame.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: frame.value[index], pointer: `${frame.pointer}/${index}` });
      }
      continue;
    }
    const record = frame.value as Readonly<Record<string, unknown>>;
    if ('$id' in record) {
      if (frame.pointer !== '#') {
        fail('NESTED_SCHEMA_ID_UNSUPPORTED', `Nested $id is unsupported: ${relativePath}${frame.pointer}`);
      }
      if (typeof record.$id !== 'string' || record.$id.length === 0) {
        fail('INVALID_SCHEMA_PATH', `Schema $id must be a non-empty relative identifier: ${relativePath}`);
      }
      rootId = normalizeSchemaId(record.$id, `Schema $id in ${relativePath}`);
    }
    if ('$ref' in record) {
      refCount += 1;
      if (refCount > PARITY_RESOURCE_LIMITS.maxRefCount) resourceLimit('maxRefCount', refCount);
      if (typeof record.$ref !== 'string' || record.$ref.length === 0) {
        fail('UNRESOLVED_SCHEMA_REF', `Schema $ref must be a non-empty string: ${relativePath}${frame.pointer}`);
      }
      const ref = parseSchemaRef(record.$ref, relativePath);
      if (ref.externalPath) externalRefs.add(ref.externalPath);
    }
    const keys = Object.keys(record).sort();
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key !== undefined) {
        stack.push({ value: record[key], pointer: `${frame.pointer}/${escapeJsonPointer(key)}` });
      }
    }
  }
  return { ...(rootId === undefined ? {} : { id: rootId }), externalRefs: [...externalRefs].sort(), refCount };
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function parseSchemaRef(reference: string, sourcePath: string): { readonly externalPath?: string; readonly fragment: string } {
  if (URI_SCHEME.test(reference) || reference.startsWith('//')) {
    fail('REMOTE_REF_REJECTED', `Remote schema refs are disabled: ${sourcePath}`, [reference]);
  }
  const hashIndex = reference.indexOf('#');
  if (hashIndex >= 0 && reference.indexOf('#', hashIndex + 1) >= 0) {
    fail('UNRESOLVED_SCHEMA_REF', `Schema ref contains multiple fragments: ${sourcePath}`, [reference]);
  }
  const rawPath = hashIndex >= 0 ? reference.slice(0, hashIndex) : reference;
  const fragment = hashIndex >= 0 ? reference.slice(hashIndex) : '';
  if (rawPath.length === 0) return { fragment };
  const refPath = normalizeSchemaPath(rawPath, `Schema $ref in ${sourcePath}`);
  const sourceDirectory = path.posix.dirname(sourcePath);
  const externalPath =
    sourceDirectory === '.'
      ? refPath
      : normalizeSchemaPath(`${sourceDirectory}/${refPath}`, `Schema $ref in ${sourcePath}`);
  return { externalPath, fragment };
}

function virtualSchemaUri(relativePath: string): string {
  return `${VIRTUAL_SCHEMA_ROOT}${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

function rewriteSchemaForAjv(schema: JsonObject, relativePath: string): JsonObject {
  preflightJson(schema);
  return withResourceBoundary('schema rewrite', () => {
    const seen = new Map<object, unknown>();
    const rewrite = (value: unknown, pointer: string): unknown => {
      if (!value || typeof value !== 'object') return value;
      const existing = seen.get(value);
      if (existing !== undefined) return existing;
      if (Array.isArray(value)) {
        const output: unknown[] = [];
        seen.set(value, output);
        value.forEach((item, index) => output.push(rewrite(item, `${pointer}/${index}`)));
        return output;
      }
      const input = value as Readonly<Record<string, unknown>>;
      const output: JsonObject = {};
      seen.set(value, output);
      for (const key of Object.keys(input).sort()) {
        if (key === '$id' && pointer === '#') {
          output.$id = virtualSchemaUri(relativePath);
        } else if (key === '$ref' && typeof input[key] === 'string') {
          const ref = parseSchemaRef(input[key], relativePath);
          output.$ref = ref.externalPath
            ? `${virtualSchemaUri(ref.externalPath)}${ref.fragment}`
            : ref.fragment;
        } else {
          output[key] = rewrite(input[key], `${pointer}/${escapeJsonPointer(key)}`);
        }
      }
      if (pointer === '#' && !('$id' in output)) output.$id = virtualSchemaUri(relativePath);
      return output;
    };
    return rewrite(schema, '#') as JsonObject;
  });
}

function ajvDiagnostic(error: ErrorObject): ParityDiagnostic {
  const codes: Readonly<Record<string, ParityDiagnosticCode>> = {
    additionalProperties: 'UNKNOWN_FIELD',
    required: 'MISSING_FIELD',
    type: 'TYPE_MISMATCH',
    enum: 'ENUM_MISMATCH',
    const: 'CONST_MISMATCH',
  };
  return {
    code: codes[error.keyword] ?? 'SCHEMA_VIOLATION',
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'Schema validation failed',
    params: error.params,
  };
}

function validationResult(
  schema: string,
  schemaFingerprint: string,
  input: unknown,
  diagnostics: readonly ParityDiagnostic[],
): ParityShapeValidationResult {
  const canonical = canonicalDiagnostics(diagnostics);
  const valid = canonical.length === 0;
  const fingerprint = sha256(
    canonicalJson({
      contract_version: PARITY_CONTRACT_VERSION,
      diagnostics: canonical,
      input,
      schema,
      schemaFingerprint,
      valid,
    }),
  );
  return {
    contract_version: PARITY_CONTRACT_VERSION,
    schema,
    valid,
    diagnostics: canonical,
    schemaFingerprint,
    fingerprint,
  };
}

export function createParityContractRuntime(options: ParityContractRuntimeOptions): ParityContractRuntime {
  assertContractVersion(options.contract_version);
  const schemaRoot = resolveSchemaRoot(options.schemaRoot);
  const declared = normalizeDeclaredSchemas(options.aggregateSchema, options.individualSchemas);
  const loaded = new Map<string, LoadedSchema>();
  const schemaPathOwners = new Map<string, string>();
  const schemaIdOwners = new Map<string, string>();
  const pending = [declared.aggregateSchema, ...declared.individualSchemas];
  const queued = new Set<string>();
  let totalSchemaSourceBytes = 0;
  let totalGraphNodeCount = 0;
  let totalRefCount = 0;

  for (const relativePath of pending) {
    registerPortableIdentity(schemaPathOwners, relativePath, 'INVALID_SCHEMA_PATH', 'Schema path');
    queued.add(relativePath);
  }

  for (let index = 0; index < pending.length; index += 1) {
    const relativePath = pending[index];
    if (relativePath === undefined || loaded.has(relativePath)) continue;
    if (loaded.size + 1 > PARITY_RESOURCE_LIMITS.maxSchemaCount) {
      resourceLimit('maxSchemaCount', loaded.size + 1);
    }
    const parsed = readSchema(schemaRoot, relativePath);
    totalSchemaSourceBytes += parsed.sourceBytes;
    if (totalSchemaSourceBytes > PARITY_RESOURCE_LIMITS.maxTotalSchemaSourceBytes) {
      resourceLimit('maxTotalSchemaSourceBytes', totalSchemaSourceBytes);
    }
    totalGraphNodeCount += parsed.nodeCount;
    if (totalGraphNodeCount > PARITY_RESOURCE_LIMITS.maxGraphNodeCount) {
      resourceLimit('maxGraphNodeCount', totalGraphNodeCount);
    }
    loaded.set(relativePath, { relativePath, schema: parsed.schema });
    const metadata = collectSchemaMetadata(parsed.schema, relativePath);
    totalRefCount += metadata.refCount;
    if (totalRefCount > PARITY_RESOURCE_LIMITS.maxRefCount) {
      resourceLimit('maxRefCount', totalRefCount);
    }
    if (metadata.id) {
      registerPortableIdentity(
        schemaIdOwners,
        metadata.id,
        'DUPLICATE_SCHEMA_ID',
        'Schema $id',
        false,
      );
    }
    for (const refPath of metadata.externalRefs) {
      registerPortableIdentity(schemaPathOwners, refPath, 'INVALID_SCHEMA_PATH', 'Schema path');
      if (!queued.has(refPath)) {
        queued.add(refPath);
        pending.push(refPath);
      }
    }
  }

  const ajv = new Ajv({
    allErrors: true,
    coerceTypes: false,
    loadSchema: undefined,
    logger: false,
    removeAdditional: false,
    strict: true,
    useDefaults: false,
    validateSchema: true,
  });
  const rewrittenSchemas = [...loaded.values()]
    .sort((left, right) =>
      left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
    )
    .map((item) => ({
      relativePath: item.relativePath,
      schema: rewriteSchemaForAjv(item.schema, item.relativePath),
    }));
  const schemaFingerprint = sha256(canonicalJson(rewrittenSchemas));
  try {
    for (const item of rewrittenSchemas) {
      withResourceBoundary('schema registration', () => ajv.addSchema(item.schema));
    }
  } catch (error) {
    if (error instanceof ParityContractError) throw error;
    fail('SCHEMA_COMPILE_FAILED', 'Schema registration failed', [
      boundedErrorText(error instanceof Error ? error.message : String(error)),
    ]);
  }

  const validators = new Map<string, ValidateFunction>();
  for (const relativePath of [declared.aggregateSchema, ...declared.individualSchemas]) {
    try {
      const validator = withResourceBoundary('schema compilation', () =>
        ajv.getSchema(virtualSchemaUri(relativePath)),
      );
      if (!validator) fail('UNRESOLVED_SCHEMA_REF', `Schema could not be compiled: ${relativePath}`);
      validators.set(relativePath, validator);
    } catch (error) {
      if (error instanceof ParityContractError) throw error;
      const message = boundedErrorText(error instanceof Error ? error.message : String(error));
      const code = /can't resolve reference|no schema with key or ref/i.test(message)
        ? 'UNRESOLVED_SCHEMA_REF'
        : 'SCHEMA_COMPILE_FAILED';
      fail(code, `Schema compilation failed: ${relativePath}`, [message]);
    }
  }

  const getValidator = (
    rawSchema: string,
  ): { readonly schema: string; readonly validator: ValidateFunction } => {
    const schema = normalizeSchemaPath(rawSchema, 'validation schema');
    const validator = validators.get(schema);
    if (!validator) {
      fail('SCHEMA_NOT_COMPILED', `Schema is not part of the compiled parity contract: ${schema}`);
    }
    return { schema, validator };
  };
  const validateShape = (request: ParityShapeValidationRequest): ParityShapeValidationResult => {
    assertContractVersion(request.contract_version);
    const { schema, validator } = getValidator(request.schema);
    preflightJson(request.value);
    const valid = withResourceBoundary('document validation', () => validator(request.value));
    const errors = validator.errors ?? [];
    if (errors.length > PARITY_RESOURCE_LIMITS.maxDiagnostics) {
      resourceLimit('maxDiagnostics', errors.length);
    }
    const diagnostics = valid ? [] : errors.map(ajvDiagnostic);
    return validationResult(schema, schemaFingerprint, request.value, diagnostics);
  };
  const validateYamlShape = (request: ParityYamlValidationRequest): ParityShapeValidationResult => {
    assertContractVersion(request.contract_version);
    const { schema } = getValidator(request.schema);
    if (typeof request.source !== 'string') fail('INVALID_DOCUMENT', 'YAML source must be a string');
    const parsed = yamlDiagnostics(request.source, schema, 'maxDocumentSourceBytes');
    if (parsed.diagnostics.length > 0) {
      return validationResult(
        schema,
        schemaFingerprint,
        { yamlSourceSha256: sha256(request.source) },
        parsed.diagnostics,
      );
    }
    return validateShape({
      contract_version: PARITY_CONTRACT_VERSION,
      schema,
      value: parsed.value,
    });
  };

  return Object.freeze({
    contract_version: PARITY_CONTRACT_VERSION,
    aggregateSchema: declared.aggregateSchema,
    individualSchemas: Object.freeze([...declared.individualSchemas]),
    loadedSchemas: Object.freeze(rewrittenSchemas.map((item) => item.relativePath)),
    schemaFingerprint,
    validateShape,
    validateYamlShape,
  });
}
