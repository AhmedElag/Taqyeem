import { createInterface } from 'node:readline/promises';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { readConfig } from './config-utils.mjs';

const local = process.argv.includes('--local');
const recover = process.argv.includes('--recover');
let origin, secret;
if (local) {
  const content = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8');
  const values = Object.fromEntries(content.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const at = line.indexOf('='); const raw = line.slice(at + 1); return [line.slice(0, at), raw.startsWith('"') ? JSON.parse(raw) : raw]; }));
  origin = new URL(values.APP_ORIGIN).origin;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) || values.DEVELOPMENT !== 'true') throw new Error('--local is limited to a configured local development origin.');
  secret = values.BOOTSTRAP_TOKEN;
} else {
  if (!process.stdin.isTTY) throw new Error('Run bootstrap interactively in a terminal so the secret can be entered without echo.');
  const config = await readConfig();
  const url = new URL(config.vars.APP_ORIGIN);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Configure the exact public HTTPS APP_ORIGIN first.');
  origin = url.origin;
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write('BOOTSTRAP_TOKEN (input hidden): ');
  try { secret = (await rl.question('')).trim(); } finally { rl.close(); process.stdout.write('\n'); }
}
if (!secret || secret.length < 32) throw new Error('BOOTSTRAP_TOKEN must contain at least 32 characters.');
const response = await fetch(origin + (recover ? '/api/auth/recover-owner' : '/api/auth/bootstrap'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin, Authorization: 'Bearer ' + secret },
  body: '{}',
  signal: AbortSignal.timeout(15000)
});
let data;
try { data = await response.json(); } catch { throw new Error('The server did not return JSON. Check the deployment URL.'); }
if (!response.ok) throw new Error(data.error?.message || 'Bootstrap failed with HTTP ' + response.status);
if (!data.activationUrl) throw new Error('The server did not return an activation link.');
console.log(recover ? 'Pending administrator invitation renewed. Open this one-time link in the administrator’s browser:' : 'Administrator created. Open this one-time link in the administrator’s browser:');
console.log(data.activationUrl);
console.log('Treat this link as a credential. It expires in seven days. Do not commit it or put it in support logs.');
