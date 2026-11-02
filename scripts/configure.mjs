import { createInterface } from 'node:readline/promises';
import { writeFile } from 'node:fs/promises';
import { configPath, readConfig, configErrors } from './config-utils.mjs';

const config = await readConfig();
const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(label, fallback = '') {
  const answer = (await rl.question(label + (fallback ? ' [' + fallback + ']' : '') + ': ')).trim();
  return answer || fallback;
}
try {
  console.log('Taqyeem production setup. No passwords or secret keys belong in this configuration.');
  config.name = await ask('Worker name', config.name);
  const originInput = new URL(await ask('Public HTTPS origin (your Workers URL or custom domain)', config.vars.APP_ORIGIN));
  if (originInput.pathname !== '/' || originInput.search || originInput.hash || originInput.username || originInput.password) throw new Error('Use the application origin without a path, query, fragment, or credentials.');
  config.vars.APP_ORIGIN = originInput.origin;
  config.vars.ADMIN_EMAIL = (await ask('Dr. Khaled Abdelazim’s email', config.vars.ADMIN_EMAIL)).toLowerCase();
  config.vars.MAIL_FROM = await ask('Verified sender, e.g. Taqyeem <noreply@your-domain>', config.vars.MAIL_FROM);
  config.vars.APP_TIMEZONE = await ask('Hospital IANA time zone', config.vars.APP_TIMEZONE);
  config.vars.DEVELOPMENT = 'false';
  const db = config.d1_databases.find(item => item.binding === 'DB');
  db.database_name = await ask('D1 database name', db.database_name);
  db.database_id = await ask('D1 database UUID', /^0{8}-/.test(db.database_id) ? '' : db.database_id);
  const problems = configErrors(config);
  if (problems.length) throw new Error(problems.join('\n'));
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('Saved wrangler.jsonc. Continue with secret setup and migrations in docs/DEPLOYMENT.md.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rl.close(); }
