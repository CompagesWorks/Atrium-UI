import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) =>
  command === 'serve'
    ? {
        // `npm run dev` serves the playground, importing the library from src/.
        root: resolve(__dirname, 'playground'),
        server: { fs: { allow: [__dirname] } },
      }
    : {
        build: {
          lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: 'atrium-ui',
            cssFileName: 'atrium-ui',
          },
          sourcemap: true,
        },
      },
);
