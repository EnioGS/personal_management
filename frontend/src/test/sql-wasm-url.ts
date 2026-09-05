import path from 'node:path'

/**
 * Stands in for Vite's `?url` import of sql.js's wasm when the tests run in Node.
 *
 * In the browser that import is a URL the dev server serves; in Node it is a path on
 * disk, and sql.js reads it with `fs`. Same file either way — only the way of naming it
 * differs, which is exactly what an alias is for. See vite.config.ts's test.alias.
 */
export default path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
