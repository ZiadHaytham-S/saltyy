import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const data = fileURLToPath(
  new URL('../../../.local/mongodb/data/', import.meta.url),
);
mkdirSync(data, { recursive: true });
let executable = process.env.MONGOD_PATH || 'mongod';
if (!process.env.MONGOD_PATH && process.platform === 'win32') {
  const serverDirectory = join(
    process.env.ProgramFiles || 'C:\\Program Files',
    'MongoDB',
    'Server',
  );
  if (existsSync(serverDirectory)) {
    for (const version of readdirSync(serverDirectory).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    )) {
      const candidate = join(serverDirectory, version, 'bin', 'mongod.exe');
      if (existsSync(candidate)) {
        executable = candidate;
        break;
      }
    }
  }
}
const child = spawn(
  executable,
  [
    '--replSet',
    'rs0',
    '--bind_ip',
    '127.0.0.1',
    '--port',
    '27017',
    '--dbpath',
    data,
  ],
  { stdio: 'inherit', windowsHide: true },
);
child.on('error', () => {
  console.error(
    'mongod not found. Install MongoDB Community Server or set MONGOD_PATH to mongod.exe. See README.md.',
  );
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
