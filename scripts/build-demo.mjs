import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const files = ['index.html', 'styles.css', 'mode.js', 'seed.js', 'app.js'];
const [source, css, mode, seed, app] = await Promise.all(files.map(file => readFile(new URL('dist/' + file, root), 'utf8')));
const script = value => '<script>\n' + value.replace(/<\/script/gi, '<\\/script') + '\n</script>';
const html = source.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
  .replace('<script src="mode.js"></script>', () => script(mode))
  .replace('<script src="seed.js"></script>', () => script(seed))
  .replace('<script src="app.js"></script>', () => script(app));
await mkdir(new URL('artifacts/', root), { recursive: true });
await writeFile(new URL('artifacts/Taqyeem-Demo.html', root), html);
await mkdir(new URL('docs/', root), { recursive: true });
await writeFile(new URL('docs/index.html', root), html);
await writeFile(new URL('docs/.nojekyll', root), '');
console.log('Created artifacts/Taqyeem-Demo.html and docs/index.html: portable fictional demo and GitHub Pages export; browser-local changes only.');
