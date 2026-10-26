import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Three separate builds:
//  - content:    page-side host, a self-contained IIFE (content scripts can't be modules)
//  - background: classic service worker, IIFE
//  - panel:      panel.html extension page (React UI), regular ES module build
type Target = 'content' | 'background' | 'panel';

export default defineConfig(({ mode }) => {
  const target: Target = mode === 'background' || mode === 'panel' ? mode : 'content';
  const scriptEntry = {
    content: { input: 'src/content/index.ts', file: 'content.js' },
    background: { input: 'src/background/index.ts', file: 'background.js' },
  };
  return {
    plugins: [react()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    publicDir: 'public',
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: target === 'content',
      copyPublicDir: target === 'content',
      target: 'chrome110',
      sourcemap: false,
      modulePreload: false,
      rollupOptions:
        target === 'panel'
          ? { input: 'panel.html' }
          : {
              input: scriptEntry[target].input,
              output: { format: 'iife', entryFileNames: scriptEntry[target].file, inlineDynamicImports: true },
            },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
