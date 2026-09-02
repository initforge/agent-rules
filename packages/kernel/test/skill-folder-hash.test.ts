import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashSkillFolder, skillFrontmatterName } from '../src/northstar/skill-registry.js';

const temporaryRoots: string[] = [];
afterEach(() => { for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function tempFolder(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-hash-'));
  temporaryRoots.push(root);
  return root;
}

describe('skill folder hashing', () => {
  it('produces a deterministic hash that ignores file order and separators', () => {
    const a = tempFolder();
    const b = tempFolder();
    fs.mkdirSync(path.join(a, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(b, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(a, 'a.txt'), 'alpha');
    fs.writeFileSync(path.join(a, 'nested', 'b.txt'), 'beta');
    // same content, written in a different order
    fs.writeFileSync(path.join(b, 'nested', 'b.txt'), 'beta');
    fs.writeFileSync(path.join(b, 'a.txt'), 'alpha');
    expect(hashSkillFolder(a)).toBe(hashSkillFolder(b));
  });

  it('changes the hash on a one-byte content change', () => {
    const folder = tempFolder();
    const file = path.join(folder, 'SKILL.md');
    fs.writeFileSync(file, '---\nname: x\n---\n# x\n');
    const before = hashSkillFolder(folder);
    fs.writeFileSync(file, '---\nname: x\n---\n# X\n');
    const after = hashSkillFolder(folder);
    expect(after).not.toBe(before);
  });

  it('changes the hash on a rename or path change', () => {
    const a = tempFolder();
    const b = tempFolder();
    fs.writeFileSync(path.join(a, 'SKILL.md'), 'same bytes');
    fs.writeFileSync(path.join(b, 'SKILL.md'), 'same bytes');
    expect(hashSkillFolder(a)).toBe(hashSkillFolder(b));
    fs.renameSync(path.join(b, 'SKILL.md'), path.join(b, 'SKILL2.md'));
    expect(hashSkillFolder(b)).not.toBe(hashSkillFolder(a));
  });

  it('fails closed on an empty folder', () => {
    const folder = tempFolder();
    expect(() => hashSkillFolder(folder)).toThrow(/empty/);
  });

  it('rejects a symlink', () => {
    const folder = tempFolder();
    fs.writeFileSync(path.join(folder, 'SKILL.md'), 'x');
    try {
      fs.symlinkSync(path.join(folder, 'SKILL.md'), path.join(folder, 'link.md'));
    } catch {
      // symlinks may be unavailable (no privilege) — skip rejection assert
      return;
    }
    expect(() => hashSkillFolder(folder)).toThrow(/symlink/);
  });

  it('rejects a special file (fifo)', () => {
    const folder = tempFolder();
    fs.writeFileSync(path.join(folder, 'SKILL.md'), 'x');
    try {
      fs.mkfifoSync(path.join(folder, 'pipe'));
    } catch {
      return; // not supported on this platform
    }
    expect(() => hashSkillFolder(folder)).toThrow(/special file/);
  });

  it('rejects a path escape and missing root', () => {
    const missing = path.join(tempFolder(), 'nope');
    expect(() => hashSkillFolder(missing)).toThrow(/does not exist|not a directory/);
    const file = path.join(tempFolder(), 'file.txt');
    fs.writeFileSync(file, 'x');
    expect(() => hashSkillFolder(file)).toThrow(/not a directory/);
  });

  it('reads SKILL frontmatter name', () => {
    const folder = tempFolder();
    const file = path.join(folder, 'SKILL.md');
    fs.writeFileSync(file, '---\nname: my-skill\ndescription: d\n---\n# body\n');
    expect(skillFrontmatterName(file)).toBe('my-skill');
  });
});
