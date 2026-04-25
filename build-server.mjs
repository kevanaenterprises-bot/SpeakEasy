// Compile the Express/WebSocket server to dist/index.js using esbuild.
// esbuild is a transitive dep of vite — no extra install needed.
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: 'dist',
  packages: 'external',  // keep node_modules as runtime deps
  alias: {
    '@shared': path.resolve(__dirname, 'shared'),
  },
});

console.log('✅ Server compiled → dist/index.js');
