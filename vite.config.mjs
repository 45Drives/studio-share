// vite.config.mjs
import path from 'path';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import pkg from './package.json' assert { type: 'json' }; // <-- grab version

export default defineConfig({
  // ...your existing config...
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version), // <-- inject at build + dev
  },
  root: path.join(process.cwd(), 'src', 'renderer'),
  publicDir: 'public',
  server: { port: 8080, strictPort: false, host: true },
  base: './',
  build: {
    outDir: path.join(process.cwd(), 'build', 'renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]',
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
      },
    },
  },
  plugins: [
    vue({
      template: { compilerOptions: { isCustomElement: (tag) => tag === 'webview' } },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
