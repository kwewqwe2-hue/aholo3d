import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../',import.meta.url));
const out = resolve(root,'dist');
await build({
  configFile:false,root,base:'./',publicDir:false,
  build:{outDir:out,emptyOutDir:false,minify:false,assetsInlineLimit:0,
    rolldownOptions:{input:resolve(root,'practice.html'),output:{entryFileNames:'assets/trial.js',assetFileNames:'assets/[name][extname]'}}}
});
const index = await readFile(resolve(out,'practice.html'),'utf8');
const script = index.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/);
const style = index.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!script || !style) throw new Error('The trial build did not produce its script and style.');
async function part(url) {
  if (!/^\.\/assets\/[\w.-]+$/.test(url)) throw new Error('Unexpected local asset path: '+url);
  return readFile(resolve(out,url),'utf8');
}
const source=(await part(script[1])).replace(/<\/script/gi,'<\\/script');
const css=await part(style[1]);
const html=index.replace(script[0],()=>'<script type="module">'+source+'</script>').replace(style[0],()=>'<style>'+css+'</style>');
await writeFile(resolve(out,'独立操控试驾.html'),html,'utf8');
console.log('Offline: 独立操控试驾.html',Math.ceil(Buffer.byteLength(html)/1024)+' KiB');
