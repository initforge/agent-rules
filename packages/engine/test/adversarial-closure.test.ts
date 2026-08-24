import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = path.resolve(__dirname, '..', 'src');
const CLI_SRC = path.resolve(__dirname, '..', '..', 'cli', 'src');

function collectTsFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(full);
      }
    }
  };
  walk(root);
  return results;
}

const APP_SRC_ROOTS = [ENGINE_SRC, CLI_SRC];
const APP_FILES = APP_SRC_ROOTS.flatMap(collectTsFiles);
const LINE_LIMIT = 1000;

const TODO_FIXME_HACK_PATTERN = /TODO|FIXME|HACK/;
const ANY_EXPORT_PATTERN = /export\s+(async\s+)?function\s+\w+\s*\([^)]*:\s*any\b/;
const ANY_EXPORT_RES_PATTERN = /export\s+(async\s+)?function\s+\w+\s*\([^)]*\b(res|req|err|installed)\s*:\s*any\b/;

describe('C5-P9 adversarial closure: maintainability review', () => {
  it('no files exceed 1000 lines', () => {
    const overLimit = APP_FILES
      .map((f) => ({ file: f, lines: fs.readFileSync(f, 'utf-8').split('\n').length }))
      .filter(({ file, lines }) => {
        const relative = path.relative(path.resolve(__dirname, '..', '..', '..'), file);
        return lines > LINE_LIMIT && !relative.startsWith('generated');
      });
    if (overLimit.length > 0) {
      console.log('Files over 1000 lines:', overLimit.map((f) => `${path.relative(path.resolve(__dirname, '..', '..', '..'), f.file)} (${f.lines} lines)`).join('\n'));
    }
    expect(overLimit.length).toBe(0);
  });

  it('no TODO/FIXME/HACK comments in production source', () => {
    const violations: string[] = [];
    for (const file of APP_FILES) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (TODO_FIXME_HACK_PATTERN.test(lines[i])) {
          violations.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    if (violations.length > 0) {
      console.log('TODO/FIXME/HACK violations:', violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });

  it('no export uses any type in function parameters', () => {
    const violations: string[] = [];
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (ANY_EXPORT_PATTERN.test(lines[i])) {
          violations.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    if (violations.length > 0) {
      console.log('Export with `any` type in parameters:', violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });

  it('consistent error handling pattern', () => {
    const issues: string[] = [];
    for (const file of APP_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('catch')) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('catch') && line.includes('console.error')) {
            issues.push(`${path.relative(path.resolve(__dirname, '..', '..', '..'), file)}:${i + 1}: catch with console.error`);
          }
        }
      }
    }
    const srcDirs = [ENGINE_SRC].filter((d) => fs.existsSync(d));
    for (const srcDir of srcDirs) {
      const files = collectTsFiles(srcDir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const hasThrow = content.includes('throw new Error');
        const hasReturnError = content.includes('return.*error');
        if (hasReturnError && !hasThrow) {
          const relative = path.relative(path.resolve(__dirname, '..', '..', '..'), file);
          issues.push(`${relative}: uses return-error pattern without throw`);
        }
      }
    }
    if (issues.length > 0) {
      console.log('Error handling consistency issues:', issues.join('\n'));
    }
    expect(issues.length).toBe(0);
  });

  it('no circular dependencies between packages', () => {
    const packageDirs = [ENGINE_SRC, CLI_SRC].filter((d) => fs.existsSync(d));
    const crossImports: string[] = [];
    for (const dir of packageDirs) {
      const files = collectTsFiles(dir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const relative = path.relative(path.resolve(__dirname, '..', '..', '..'), file);
        for (const otherDir of packageDirs) {
          if (dir === otherDir) continue;
          const otherPkg = path.basename(path.dirname(otherDir));
          if (content.includes(`from '${otherPkg}`) || content.includes(`from "../../${otherPkg}`)) {
            crossImports.push(`${relative} imports from ${otherPkg}`);
          }
        }
      }
    }
    if (crossImports.length > 0) {
      console.log('Cross-package imports:', crossImports.join('\n'));
    }
    expect(crossImports.length).toBe(0);
  });
});
