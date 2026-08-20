import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiError } from '../services/safety.js';

const router = Router();

interface HostFact {
  id: string;
  display: string;
  installed: boolean;
  installMethod?: string;
  binaryOnPath?: boolean;
  desktopProcess?: boolean;
  configDir?: boolean;
  liveProbe?: boolean;
  candidate?: string | null;
  effective?: string | null;
}

const HOSTS: Array<{ id: string; display: string; binary: string; config: string; candidate: string; effective: string | null }> = [
  {
    id: 'codex',
    display: 'Codex',
    binary: 'codex',
    config: path.join('.codex', 'config.toml'),
    candidate: '6e9a554a',
    effective: 'ca7ba4ad',
  },
  {
    id: 'opencode',
    display: 'OpenCode',
    binary: 'opencode',
    config: path.join('.config', 'opencode', 'opencode.json'),
    candidate: '6e9a554a',
    effective: 'ca7ba4ad',
  },
  {
    id: 'antigravity',
    display: 'Antigravity',
    binary: 'antigravity',
    config: path.join('.gemini', 'antigravity', 'mcp_config.json'),
    candidate: '6e9a554a',
    effective: 'ca7ba4ad',
  },
  {
    id: 'grok',
    display: 'Grok',
    binary: 'grok',
    config: path.join('.grok', 'mcp.json'),
    candidate: '6e9a554a',
    effective: null,
  },
  {
    id: 'claude',
    display: 'Claude',
    binary: 'claude',
    config: '.claude.json',
    candidate: '6e9a554a',
    effective: null,
  },
  {
    id: 'cursor',
    display: 'Cursor',
    binary: 'cursor',
    config: path.join('.cursor', 'mcp.json'),
    candidate: '6e9a554a',
    effective: null,
  },
];

function onPath(binary: string): boolean {
  const paths = String(process.env.PATH || '').split(':');
  return paths.some((dir) => dir && fs.existsSync(path.join(dir, binary)));
}

function hasConfig(home: string, relative: string): boolean {
  return fs.existsSync(path.join(home, relative));
}

router.get('/', (_req, res) => {
  try {
    const home = os.homedir();
    const hosts: HostFact[] = HOSTS.map((host) => {
      const installed = onPath(host.binary) || hasConfig(home, host.config);
      return {
        id: host.id,
        display: host.display,
        installed,
        binaryOnPath: onPath(host.binary),
        configDir: hasConfig(home, host.config),
        desktopProcess: installed ? undefined : false,
        liveProbe: installed ? undefined : false,
        candidate: host.candidate,
        effective: host.effective,
        installMethod: installed ? (onPath(host.binary) ? 'binary-on-path' : 'config-dir') : undefined,
      };
    });
    res.json({
      ok: true,
      data: {
        installed: hosts.filter((h) => h.installed).length,
        notInstalled: hosts.filter((h) => !h.installed).length,
        hosts,
      },
    });
  } catch (err) {
    apiError(res, 500, err);
  }
});

export default router;
