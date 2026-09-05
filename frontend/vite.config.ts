import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Overridden at build time for GitHub Pages project sites, which serve
  // from a subpath (e.g. /repo-name/) rather than the domain root.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // sql.js's wasm is a served URL in the browser and a file path in Node; the tests
    // get the path, so the SQL layer can be exercised for real rather than mocked.
    alias: [{ find: /^sql\.js\/dist\/sql-wasm\.wasm\?url$/, replacement: path.resolve(__dirname, './src/test/sql-wasm-url.ts') }],
  },
})
