import {
  routeNativeTurn,
  type NativeTurnRequest,
  NativeTurnRouterError,
} from '@initforge/agent-rules-kernel/northstar/native-turn-router.js';

/**
 * CLI transport for routeNativeTurn (REQ-005).
 * Reads NativeTurnRequest JSON from stdin, writes RouteCapsule JSON to stdout,
 * and prints diagnostics to stderr only. Raw prompt is never interpolated into
 * a shell string.
 */
export async function handleRouteNativeCommand(options: { stdin?: boolean; runsRoot?: string }): Promise<void> {
  if (!options.stdin) {
    process.stderr.write('agent-rules route-native: currently only --stdin transport is supported\n');
    process.exitCode = 1;
    return;
  }

  const raw = await readStdin();
  if (!raw.trim()) {
    process.stderr.write('agent-rules route-native: empty input on stdin\n');
    process.exitCode = 1;
    return;
  }

  let request: NativeTurnRequest;
  try {
    request = JSON.parse(raw) as NativeTurnRequest;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`agent-rules route-native: invalid JSON on stdin: ${msg}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const { capsule } = routeNativeTurn(request, {
      ...(options.runsRoot ? { runsRoot: options.runsRoot } : {}),
    });
    process.stdout.write(JSON.stringify(capsule) + '\n');
  } catch (err: unknown) {
    const status = err instanceof NativeTurnRouterError ? err.status : 'BLOCKED';
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`agent-rules route-native [${status}]: ${msg}\n`);
    process.exitCode = 1;
  }
}

function readStdin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err: Error) => reject(err));
  });
}
