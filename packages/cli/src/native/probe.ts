import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { HostId } from '@initforge/agent-rules-kernel/northstar/host-adapters.js';
import { getNativeContract } from '@initforge/agent-rules-kernel/northstar/host-registry.js';
import type { Detection, InstallPlan, InventoryEntry } from './types.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Native facts only: detect, inventory and plan without modifying a host. */
export class NativeHostProbe {
  async detect(host: HostId): Promise<Detection> {
    const contract = getNativeContract(host);
    if (!contract) return { host, present: false, homeDir: '', signals: [] };
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    const homeDir = process.env[contract.homeEnv] || contract.homeDefault.replace('~', userHome).replace(/\$[A-Z_]+/, userHome);
    const cli = contract.cliSignal.split(' ')[0].replace('.exe', '');
    const binaryPath = [...(process.env.PATH || '').split(path.delimiter), homeDir]
      .flatMap((folder) => process.platform === 'win32'
        ? [path.join(folder, `${cli}.exe`), path.join(folder, `${cli}.cmd`), path.join(folder, `${cli}.bat`), path.join(folder, `${cli}.ps1`), path.join(folder, cli)]
        : [path.join(folder, cli)])
      .find((candidate) => fs.existsSync(candidate));
    const desktopCandidates: Record<string, string[]> = {
      antigravity: [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity', 'Antigravity.exe')],
      cursor: [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Cursor', 'Cursor.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'Cursor.exe')],
      claude: [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Claude', 'Claude.exe')],
    };
    const desktopPath = (desktopCandidates[host] ?? []).find((candidate) => fs.existsSync(candidate));
    const signals = [binaryPath && `binary-on-path:${binaryPath}`, desktopPath && `desktop-process:${desktopPath}`, fs.existsSync(homeDir) && `config-dir:${homeDir}`].filter((value): value is string => Boolean(value));
    return { host, present: Boolean(binaryPath || desktopPath || fs.existsSync(homeDir)), homeDir, signals, ...(binaryPath || desktopPath ? { binaryPath: binaryPath ?? desktopPath } : {}) };
  }

  async inventory(detection: Detection): Promise<InventoryEntry[]> {
    const contract = getNativeContract(detection.host);
    if (!contract) return [];
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    const out: InventoryEntry[] = [];
    for (const configuredPath of [contract.paths.instructionPath, contract.paths.skillPath, contract.paths.agentPath, contract.paths.hookPath, contract.paths.mcpPath]) {
      if (!configuredPath) continue;
      const resolved = configuredPath.replace(/\$[A-Z_]+/, detection.homeDir).replace('~', userHome);
      if (resolved.includes('n/a') || resolved.includes('managed_profile') || resolved.includes('bundle') || resolved.includes('mods') || !fs.existsSync(resolved)) continue;
      try {
        if (fs.statSync(resolved).isDirectory()) {
          const content = fs.readdirSync(resolved).flatMap((name) => { try { return [fs.readFileSync(path.join(resolved, name), 'utf8')]; } catch { return []; } }).join('\n');
          const owned = content.includes('agent-rules');
          out.push({ host: detection.host, kind: content.includes('<<<<<<<') ? 'malformed' : owned ? 'owned' : 'unmanaged', path: resolved, owned });
          continue;
        }
      } catch { /* file read below returns honest empty evidence */ }
      let content = ''; try { content = fs.readFileSync(resolved, 'utf8'); } catch { /* unreadable stays unowned */ }
      const owned = content.includes('agent-rules:managed') || content.includes('<!-- agent-rules:');
      out.push({ host: detection.host, kind: content.includes('<<<<<<<') ? 'malformed' : owned ? 'owned' : 'unmanaged', path: resolved, owned, ...(content ? { sha256: sha256(content) } : {}) });
    }
    if (detection.host === 'grok') {
      const canonical = path.join(detection.homeDir, 'rules');
      const legacy = path.join(detection.homeDir, '.grok', 'rules');
      // A legacy directory without an agent-rules marker is user data. It is
      // neither deleted nor treated as a duplicate of the canonical surface.
      const legacyManaged = fs.existsSync(legacy) && fs.readdirSync(legacy).some((name) => {
        try { return fs.statSync(path.join(legacy, name)).isFile() && fs.readFileSync(path.join(legacy, name), 'utf8').includes('agent-rules:managed:grok'); } catch { return false; }
      });
      if (fs.existsSync(canonical) && legacyManaged) out.push({ host: detection.host, kind: 'duplicate', path: `${canonical}+${legacy}`, owned: true });
    }
    return out;
  }

  planInstall(host: HostId, detection: Detection): InstallPlan {
    const contract = getNativeContract(host);
    if (!contract) throw new Error(`no contract for ${host}`);
    const changes: InstallPlan['changes'] = [
      { path: contract.paths.instructionPath.replace(/\$[A-Z_]+/, detection.homeDir), op: 'patch' },
      { path: contract.paths.skillPath, op: 'write' },
    ];
    if (host === 'command-code') {
      changes.push({ path: path.join(detection.homeDir, 'mods', 'agent-rules.ts'), op: 'write' });
    }
    return { host, changes, backupDir: path.join(process.cwd(), '.agent', 'tmp', 'backups', host, `${Date.now()}-${randomUUID().slice(0, 8)}`) };
  }
}
