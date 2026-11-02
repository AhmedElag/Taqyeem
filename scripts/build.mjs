import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'public');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
let html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
if (!html.includes('<script src="mode.js"></script>')) throw new Error('The frontend must load external mode.js before app.js.');
html = html.replace(/\s*<script src="seed\.js"><\/script>/g, '');
if (/seed\.js|<script(?:\s[^>]*)?>\s*[^<\s]/.test(html)) throw new Error('Production HTML must exclude demo seed and inline JavaScript.');
await writeFile(path.join(out, 'index.html'), html);
await writeFile(path.join(out, 'mode.js'), "window.TAQYEEM_MODE = 'live';\n");
await Promise.all(['app.js', 'styles.css'].map(file => copyFile(path.join(root, 'dist', file), path.join(out, file))));
console.log('Built public/: live sign-in, server persistence, no fictional seed data.');
