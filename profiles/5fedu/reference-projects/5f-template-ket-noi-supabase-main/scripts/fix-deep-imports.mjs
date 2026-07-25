#!/usr/bin/env node
/**
 * Rewrites cross-folder relative imports to @/ path alias.
 * Keeps ./ and ../ within the same feature entity (features/<domain>/<entity>/).
 *
 * Usage:
 *   node scripts/fix-deep-imports.mjs          # apply
 *   node scripts/fix-deep-imports.mjs --dry-run
 *   node scripts/fix-deep-imports.mjs --check  # exit 1 if convertible relative imports remain
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', '.cursor', '.npm-cache']);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const checkOnly = args.has('--check');

/** @param {string} filePath */
function getFeatureEntityRoot(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
  const match = rel.match(/^features\/[^/]+\/[^/]+\//);
  if (!match) return null;
  const parts = rel.split('/');
  return path.join(ROOT, parts[0], parts[1], parts[2]);
}

/**
 * Keep ./foo and ../ within features/<domain>/<entity>/ only.
 * @param {string} fromFile
 * @param {string} spec
 */
function shouldKeepRelative(fromFile, spec) {
  if (spec.startsWith('./')) return true;
  if (!spec.startsWith('.')) return false;

  const entityRoot = getFeatureEntityRoot(fromFile);
  if (!entityRoot) return false;

  const resolved = path.normalize(path.resolve(path.dirname(fromFile), spec));
  const relToEntity = path.relative(entityRoot, resolved);
  return !relToEntity.startsWith('..') && !path.isAbsolute(relToEntity);
}

/**
 * @param {string} fromFile
 * @param {string} spec
 */
function shouldConvertToAlias(fromFile, spec) {
  if (!spec.startsWith('.')) return false;
  return !shouldKeepRelative(fromFile, spec);
}

/**
 * @param {string} fromFile
 * @param {string} spec
 */
function toAliasImport(fromFile, spec) {
  const fromDir = path.dirname(fromFile);
  const resolved = path.normalize(path.resolve(fromDir, spec));
  const rel = path.relative(ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  const withoutExt = rel.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
  return `@/${withoutExt.split(path.sep).join('/')}`;
}

/** @param {string} dir */
function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      files.push(full);
    }
  }
  return files;
}

const FROM_IMPORT_RE = /from\s+(['"])(\.\.[^'"]+)\1/g;

let filesChanged = 0;
let importsFixed = 0;
let importsRemaining = 0;

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  let changed = false;

  const next = original.replace(FROM_IMPORT_RE, (match, quote, spec) => {
    if (!shouldConvertToAlias(file, spec)) {
      return match;
    }
    if (checkOnly) {
      importsRemaining += 1;
      return match;
    }
    const alias = toAliasImport(file, spec);
    if (!alias) return match;
    changed = true;
    importsFixed += 1;
    return `from ${quote}${alias}${quote}`;
  });

  if (checkOnly) {
    continue;
  }

  if (changed && next !== original) {
    filesChanged += 1;
    if (!dryRun) {
      fs.writeFileSync(file, next, 'utf8');
    } else {
      console.log(`Would update: ${path.relative(ROOT, file)}`);
    }
  }
}

if (checkOnly) {
  if (importsRemaining > 0) {
    console.error(
      `Found ${importsRemaining} cross-folder relative import(s). Run fix-deep-imports.mjs to fix.`,
    );
    process.exit(1);
  }
  console.log('No cross-folder relative imports requiring @/ alias found.');
  process.exit(0);
}

if (dryRun) {
  console.log(`Dry run: ${importsFixed} import(s) in ${filesChanged} file(s) would change.`);
} else {
  console.log(`Fixed ${importsFixed} import(s) in ${filesChanged} file(s).`);
}
