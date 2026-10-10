import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The playground bundles Bootstrap Icons, whose MIT license must ship with it, but the
 * CSS minifier drops its license comment. Serve and emit THIRD-PARTY-NOTICES.txt instead.
 */
function thirdPartyNotices(): Plugin {
  const fileName = 'THIRD-PARTY-NOTICES.txt';
  const read = () => readFileSync(resolve(__dirname, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  return {
    name: 'atrium-third-party-notices',
    configureServer(server) {
      server.middlewares.use(`/${fileName}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(read());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: read() });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  if (command === 'serve' || mode === 'playground') {
    // `npm run dev` serves the playground; `npm run build:playground` builds it as a static
    // site for GitHub Pages (served from /Atrium-UI/), importing the library from src/.
    return {
      root: resolve(__dirname, 'playground'),
      base: mode === 'playground' ? (process.env.PLAYGROUND_BASE ?? '/Atrium-UI/') : '/',
      server: { fs: { allow: [__dirname] } },
      plugins: [thirdPartyNotices()],
      build: {
        outDir: resolve(__dirname, 'dist-playground'),
        emptyOutDir: true,
      },
    };
  }

  return {
    build: {
      lib: {
        entry: {
          'atrium-ui': resolve(__dirname, 'src/index.ts'),
          electron: resolve(__dirname, 'src/electron/index.ts'),
        },
        // CommonJS too: Electron preloads run as CommonJS when sandboxed (the default).
        formats: ['es', 'cjs'],
        fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
        cssFileName: 'atrium-ui',
      },
      sourcemap: true,
    },
  };
});
