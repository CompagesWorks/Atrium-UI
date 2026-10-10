import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => {
  if (command === 'serve' || mode === 'playground') {
    // `npm run dev` serves the playground; `npm run build:playground` builds it as a static
    // site for GitHub Pages (served from /Atrium-UI/), importing the library from src/.
    return {
      root: resolve(__dirname, 'playground'),
      base: mode === 'playground' ? (process.env.PLAYGROUND_BASE ?? '/Atrium-UI/') : '/',
      server: { fs: { allow: [__dirname] } },
      build: {
        outDir: resolve(__dirname, 'dist-playground'),
        emptyOutDir: true,
      },
    };
  }

  return {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        formats: ['es'],
        fileName: 'atrium-ui',
        cssFileName: 'atrium-ui',
      },
      sourcemap: true,
    },
  };
});
