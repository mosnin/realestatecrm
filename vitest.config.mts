import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  css: {
    // Prevent Vite from loading postcss.config.mjs (Tailwind v4 string-plugin
    // syntax is valid for Next.js but not for raw Vite / vitest).
    postcss: { plugins: [] },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'scripts'],
    globals: false,
  },
});
