import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DOWNLOAD_DIR = path.join(ROOT, '.agent', 'tmp', 'downloads');
const RECEIPTS_DIR = path.join(ROOT, '.agent', 'tmp', 'host-receipts');

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

async function resolveCursorUrl() {
  const initialUrl = 'https://api2.cursor.sh/updates/download/golden/win32-x64-user/cursor/latest';
  console.log('Resolving dynamic Cursor installer URL from:', initialUrl);
  const res = await fetch(initialUrl, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (!location) {
    throw new Error(`Failed to resolve Cursor download location: status ${res.status}`);
  }
  const parsed = new URL(location);
  if (parsed.hostname !== 'downloads.cursor.com' && parsed.hostname !== 'api2.cursor.sh') {
    throw new Error(`Untrusted download domain: ${parsed.hostname}`);
  }
  console.log('Resolved installer URL:', location);
  return location;
}

async function downloadFile(url, targetPath) {
  console.log('Downloading installer to:', targetPath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(targetPath, buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  console.log(`Download complete: ${buffer.length} bytes, SHA-256: ${sha256}`);
  return { bytes: buffer.length, sha256 };
}

function verifyAuthenticode(installerPath) {
  console.log('Verifying Authenticode signature for:', installerPath);
  const psScript = `
    $sig = Get-AuthenticodeSignature -FilePath "${installerPath.replace(/\\/g, '\\\\')}"
    [PSCustomObject]@{
      Status = $sig.Status.ToString()
      StatusMessage = $sig.StatusMessage
      Subject = $sig.SignerCertificate.Subject
      Thumbprint = $sig.SignerCertificate.Thumbprint
    } | ConvertTo-Json -Compress
  `;
  const raw = execFileSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf8' }).trim();
  const sigInfo = JSON.parse(raw);
  console.log('Authenticode result:', sigInfo);

  if (sigInfo.Status !== 'Valid') {
    throw new Error(`Authenticode signature invalid: ${sigInfo.Status} (${sigInfo.StatusMessage})`);
  }
  if (!sigInfo.Subject || !sigInfo.Subject.includes('Anysphere')) {
    throw new Error(`Authenticode signer mismatch: expected Anysphere, got ${sigInfo.Subject}`);
  }
  return sigInfo;
}

function runSilentInstall(installerPath) {
  console.log('Executing silent per-user installation with /VERYSILENT /NORESTART...');
  const args = ['/VERYSILENT', '/NORESTART', '/MERGETASKS=!runcode'];
  execFileSync(installerPath, args, { stdio: 'inherit', timeout: 180_000 });
  console.log('Installer execution finished.');
}

function discoverCursorBinary() {
  const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(localApp, 'Programs', 'cursor', 'Cursor.exe'),
    path.join(localApp, 'cursor', 'Cursor.exe'),
    path.join(localApp, 'Programs', 'Cursor', 'Cursor.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log('Found Cursor executable at:', c);
      return c;
    }
  }
  try {
    const fromPath = execFileSync('powershell', ['-NoProfile', '-Command', '(Get-Command cursor.exe -ErrorAction SilentlyContinue).Source'], { encoding: 'utf8' }).trim();
    if (fromPath && fs.existsSync(fromPath)) {
      console.log('Found Cursor on PATH at:', fromPath);
      return fromPath;
    }
  } catch {}
  throw new Error('Cursor binary not found after installation');
}

function extractVersion(binaryPath) {
  const psScript = `(Get-Item "${binaryPath.replace(/\\/g, '\\\\')}").VersionInfo.ProductVersion`;
  const version = execFileSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf8' }).trim();
  console.log('Detected Cursor ProductVersion:', version);
  return version;
}

function configureCursorMcp() {
  const cursorDir = path.join(os.homedir(), '.cursor');
  fs.mkdirSync(cursorDir, { recursive: true });
  const mcpPath = path.join(cursorDir, 'mcp.json');
  const bakPath = path.join(cursorDir, 'mcp.json.bak');

  let existing = {};
  if (fs.existsSync(mcpPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      fs.copyFileSync(mcpPath, bakPath);
      console.log('Backed up existing Cursor MCP config to:', bakPath);
    } catch {
      existing = {};
    }
  }

  const memoryBin = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'codebase-memory-mcp', 'codebase-memory-mcp.exe');
  const servers = existing.mcpServers || {};

  if (fs.existsSync(memoryBin)) {
    servers['codebase-memory'] = {
      command: memoryBin,
      args: []
    };
  }

  const merged = {
    ...existing,
    mcpServers: servers
  };

  fs.writeFileSync(mcpPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log('Configured Cursor MCP at:', mcpPath);
  return { mcpPath, bakPath, serverCount: Object.keys(servers).length };
}

async function main() {
  console.log('=== Starting Cursor Native Windows Installation & Configuration ===');
  const installerUrl = await resolveCursorUrl();
  const installerPath = path.join(DOWNLOAD_DIR, 'CursorUserSetup.exe');

  const { bytes, sha256: installerSha } = await downloadFile(installerUrl, installerPath);
  const authenticode = verifyAuthenticode(installerPath);

  runSilentInstall(installerPath);

  // Allow OS file system flush
  await new Promise(r => setTimeout(r, 2000));

  const binaryPath = discoverCursorBinary();
  const productVersion = extractVersion(binaryPath);
  const mcpResult = configureCursorMcp();

  const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

  const receipt = {
    host: 'cursor',
    platform: 'win32',
    arch: 'x64',
    installation_type: 'native_inno_setup_user',
    installer_url: installerUrl,
    installer_bytes: bytes,
    installer_sha256: installerSha,
    authenticode: {
      status: authenticode.Status,
      subject: authenticode.Subject,
      thumbprint: authenticode.Thumbprint
    },
    installed_binary: binaryPath,
    product_version: productVersion,
    mcp_config: mcpResult,
    installed_at: new Date().toISOString(),
    git_head: gitHead,
    auth_status: 'UNAUTHENTICATED' // Desktop requires interactive OAuth session
  };

  const receiptJson = JSON.stringify(receipt, null, 2);
  const receiptSha = crypto.createHash('sha256').update(receiptJson).digest('hex');
  receipt.receipt_sha256 = receiptSha;

  const receiptFile = path.join(RECEIPTS_DIR, 'cursor-install-receipt.json');
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2), 'utf8');

  console.log('=== Cursor Installation & Verification SUCCESS ===');
  console.log('Receipt written to:', receiptFile);
  console.log('Receipt SHA-256:', receiptSha);
}

main().catch(err => {
  console.error('ERROR in Cursor installation:', err.message);
  process.exit(1);
});
