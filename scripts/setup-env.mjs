import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
for (const app of ['api', 'web']) {
  try {
    await copyFile(
      new URL('../apps/' + app + '/.env.example', import.meta.url),
      new URL('../apps/' + app + '/.env', import.meta.url),
      constants.COPYFILE_EXCL,
    );
    console.log(app + ': created local .env');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(app + ': existing .env preserved');
  }
}
const apiEnv = new URL('../apps/api/.env', import.meta.url);
let content = await readFile(apiEnv, 'utf8');
if (!/^CSRF_SECRET=.+$/m.test(content)) {
  const entry = 'CSRF_SECRET=' + randomBytes(32).toString('hex');
  content = /^CSRF_SECRET=.*$/m.test(content)
    ? content.replace(/^CSRF_SECRET=.*$/m, entry)
    : content + '\n' + entry + '\n';
  await writeFile(apiEnv, content, { mode: 0o600 });
  console.log('api: local CSRF key generated; its value was not printed.');
}
