import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Restrictive CSP for production builds. Not applied in dev because Vite's HMR needs inline scripts.
// 'wasm-unsafe-eval' is required only to instantiate the Argon2id WebAssembly module.
const csp: Plugin = {
  name: 'apivault-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: [
          "default-src 'self'",
          "script-src 'self' 'wasm-unsafe-eval'",
          "style-src 'self'",
          "img-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join('; '),
      },
      injectTo: 'head-prepend',
    },
  ],
}

export default defineConfig({
  plugins: [react(), csp],
  server: {
    port: 5173,
    // Same-origin API in dev so the HttpOnly refresh cookie behaves like production.
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:5149', changeOrigin: false } },
  },
  test: { environment: 'node' },
})
