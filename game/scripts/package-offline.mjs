import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const index = await readFile(join(root, 'index.html'), 'utf8');
const script = index.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/);
const style = index.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/);
if (!script || !style) throw new Error('Expected one entry script and one stylesheet');

async function asset(url) {
  const file = resolve(root, url.replace(/^\.?\//, ''));
  if (dirname(file) !== resolve(root, 'assets')) throw new Error('Unexpected asset path: ' + url);
  return readFile(file, 'utf8');
}
const javascript = (await asset(script[1])).replace(/<\/script/gi, '<\\/script');
const css = await asset(style[1]);
const html = index
  .replace(script[0], () => '<script type="module">' + javascript + '</script>')
  .replace(style[0], () => '<style>' + css + '</style>');
const destination = join(root, '牛逼外卖-第一天.html');
await writeFile(destination, html, 'utf8');
// Keep the file link from the handling review usable if the local server is closed.
const previousEntry = resolve(root, '../trial/dist');
await mkdir(previousEntry, { recursive: true });
await writeFile(join(previousEntry, '球场试驾.html'), html, 'utf8');
console.log('Offline game:', basename(destination), Math.ceil(Buffer.byteLength(html) / 1024) + ' KiB');
