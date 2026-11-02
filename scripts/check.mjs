import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(relative));
    else if (/\.(m?js)$/.test(entry.name)) result.push(relative);
  }
  return result;
}
const files = (await Promise.all(['dist', 'server', 'scripts', 'tests'].map(walk))).flat();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(result.status || 1); }
}
const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
if (!html.includes('Taqyeem') || html.indexOf('mode.js') > html.indexOf('app.js')) throw new Error('Unexpected branding or mode load order.');
JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
console.log('Syntax and source checks passed (' + files.length + ' JavaScript modules).');
