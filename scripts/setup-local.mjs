import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const devPath = fileURLToPath(new URL('../.dev.vars', import.meta.url));
let exists = false;
try { await access(devPath); exists = true; } catch {}
if (exists) {
  console.log('Keeping existing .dev.vars. Local setup will preserve existing records.');
} else {
  const values = {
    APP_ORIGIN: 'http://localhost:8787',
    ADMIN_EMAIL: 'admin@example.test',
    MAIL_FROM: 'Taqyeem Local <local@example.test>',
    APP_TIMEZONE: 'UTC',
    DEVELOPMENT: 'true',
    SESSION_SECRET: randomBytes(48).toString('base64url'),
    BOOTSTRAP_TOKEN: randomBytes(48).toString('base64url')
  };
  await writeFile(devPath, Object.entries(values).map(([key, value]) => key + '=' + JSON.stringify(value)).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  console.log('Created ignored .dev.vars with local-only values and random development secrets.');
}
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
for (const args of [
  ['d1', 'migrations', 'apply', 'DB', '--local'],
  ['d1', 'execute', 'DB', '--local', '--file=server/setup/psychiatry.sql']
]) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nLocal database ready. Run npm run dev:live; in another terminal run npm run bootstrap:local.');
console.log('The development mail sink returns test sign-in links only for the configured localhost origin.');
