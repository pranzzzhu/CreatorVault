import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  optimizeDeps: {
    entries: ['index.html']
  },
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron',
                'node:child_process',
                'node:fs',
                'node:fs/promises',
                'node:path',
                'node:os',
                'node:crypto',
                'node:url',
                'node:util',
                'node:stream',
                'node:stream/promises'
              ]
            }
          }
        }
      },
      preload: {
        input: path.join(import.meta.dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    })
  ]
});
