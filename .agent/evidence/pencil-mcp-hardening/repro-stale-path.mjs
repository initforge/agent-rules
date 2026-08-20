import { spawn } from 'node:child_process';
const stale = '/tmp/.mount_Pen.Ap2ErpvK/resources/app.asar.unpacked/out/mcp-server-linux-x64';
const child = spawn(stale, ['--app', 'desktop', '--agent', 'openCodeCLI'], { stdio: 'pipe' });
let output = '';
const done = new Promise((resolve) => {
  child.on('error', (err) => resolve(`SPAWN ERROR: ${err.code}: ${err.message}`));
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  child.on('exit', (code) => resolve(`EXIT: ${code}\n${output}`));
  setTimeout(() => resolve(`TIMEOUT (no exit, no error)\n${output}`), 4000);
});
console.log(await done);
