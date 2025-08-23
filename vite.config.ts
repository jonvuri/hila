import { defineConfig } from 'vite'
import 'vitest/config' // Extends Vite config types
import solidPlugin from 'vite-plugin-solid'
import { patchCssModules } from 'vite-css-modules'

export default defineConfig({
  plugins: [
    patchCssModules({
      // Only export an object with the class names, so that special characters
      // work without much hassle (like having to use es2022 or up).
      exportMode: 'default',
      // Generate TypeScript types (*.d.ts files) for the CSS modules.
      generateSourceTypes: true,
    }),
    solidPlugin(),
  ],
  test: {
    setupFiles: ['@vitest/web-worker'],
    environment: 'jsdom',
  },
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
})
