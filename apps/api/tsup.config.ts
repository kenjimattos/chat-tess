import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // O pacote compartilhado é código-fonte TypeScript, então entra no bundle.
  noExternal: ['@chat-tess/shared'],
});
