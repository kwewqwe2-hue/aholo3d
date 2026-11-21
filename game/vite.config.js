import { defineConfig } from 'vite';
import project from './package.json' with { type: 'json' };

// The shared art modules explicitly request inline media for the double-click
// build. Remove that delivery hint only for literal media imports / new URL()
// in the web build, before Vite resolves them relative to their source module.
const inlineMedia = /((?:\bfrom\s*|\bnew\s+URL\(\s*)(['"])\.{1,2}\/[^"'?#\r\n]+\.(?:webp|mp3))\?(?:url&)?inline\2/g;

export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    base: './',
    envDir: false,
    plugins: web ? [{
      name: 'web-release',
      enforce: 'pre',
      transformIndexHtml() {
        return [
          { tag: 'meta', attrs: { name: 'application-version', content: project.version } },
          { tag: 'style', children: '#web-opening{position:fixed;inset:48% 0 auto;margin:0;text-align:center;color:#fff7df}#interface:not(:empty)~#web-opening,#fault:not([hidden])~#web-opening{display:none}' },
          { tag: 'p', attrs: { id: 'web-opening', role: 'status' }, children: '正在打开漫画…', injectTo: 'body' },
        ];
      },
      transform(source, id) {
        if (!/\/(?:src|trial)\/.*\.js$/.test(id) || !source.includes('inline')) return;
        const code = source.replace(inlineMedia, '$1$2');
        if (code !== source) return { code, map: null };
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
      },
    }] : [],
    build: web ? {
      outDir: 'dist-web',
      copyPublicDir: false,
      assetsInlineLimit: 0,
      minify: 'oxc',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'three-core', test: /[/\\]three[/\\]build[/\\]three\.core\.js$/, priority: 3 },
              { name: 'three-renderer', test: /[/\\]node_modules[/\\]three[/\\]/, priority: 2 },
              { name: 'scene', test: /\/(?:trial\/scene|src\/(?:world|estate-art|courier-model|resident-life|stair-interior|shift-actors|aholo-assets))\.js$/ },
            ],
          },
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    } : {
      assetsInlineLimit: () => true,
      emptyOutDir: false,
      minify: false,
      rolldownOptions: {
        output: { entryFileNames: 'assets/rider.js', assetFileNames: 'assets/[name][extname]' },
      },
    },
  };
});
