import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const entryPoint = fileURLToPath(new URL('./src/extension.ts', import.meta.url));
const outfile = fileURLToPath(new URL('./dist/extension.cjs', import.meta.url));
await mkdir(fileURLToPath(new URL('./dist/', import.meta.url)), { recursive: true });

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode'],
  sourcemap: true,
});
