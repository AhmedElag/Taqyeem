import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const configPath = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
export const readConfig = async () => JSON.parse(await readFile(configPath, 'utf8'));
export const emailValid = value => typeof value === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim());
export function configErrors(config) {
  const problems = [];
  const vars = config.vars || {};
  let origin;
  try {
    origin = new URL(vars.APP_ORIGIN);
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password || vars.APP_ORIGIN !== origin.origin || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error();
  } catch { problems.push('APP_ORIGIN must be the canonical public HTTPS origin, without a trailing slash, path, query, fragment, or default port.'); }
  if (!emailValid(vars.ADMIN_EMAIL) || /@(example\.(com|org|net|test)|localhost)$/i.test(vars.ADMIN_EMAIL)) problems.push('ADMIN_EMAIL must be Dr. Khaled Abdelazim’s real, controlled email address.');
  const sender = String(vars.MAIL_FROM || '').match(/<([^>]+)>$/)?.[1] || vars.MAIL_FROM;
  if (!emailValid(sender) || /@example\./i.test(sender)) problems.push('MAIL_FROM must contain an address on your verified email-sending domain.');
  if (vars.DEVELOPMENT !== 'false') problems.push('DEVELOPMENT must be "false" in the production configuration.');
  try { new Intl.DateTimeFormat('en', { timeZone: vars.APP_TIMEZONE }).format(new Date()); } catch { problems.push('APP_TIMEZONE must be a valid IANA time zone, such as Africa/Cairo.'); }
  const db = config.d1_databases?.find(item => item.binding === 'DB');
  if (!db || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(db.database_id) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(db.database_id)) problems.push('Replace the DB database_id with the UUID returned by wrangler d1 create.');
  for (const name of ['SESSION_SECRET', 'BOOTSTRAP_TOKEN', 'RESEND_API_KEY']) if (vars[name]) problems.push(name + ' is a secret: remove it from wrangler.jsonc and use wrangler secret put.');
  return problems;
}
