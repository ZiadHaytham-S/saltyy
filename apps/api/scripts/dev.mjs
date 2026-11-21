import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const processes = [
  spawn(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '--watch', '--preserveWatchOutput'],
    { stdio: 'inherit', windowsHide: true },
  ),
  spawn(
    process.execPath,
    ['--watch', '--env-file-if-exists=.env', 'dist/main.js'],
    { stdio: 'inherit', windowsHide: true },
  ),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill();
  process.exitCode = code;
}
for (const child of processes) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
