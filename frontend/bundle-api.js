/**
 * Bundles the Vercel serverless function with esbuild.
 * Resolves all ESM/CJS conflicts by producing a single self-contained ESM file.
 *
 * Steps:
 *   1. Bundle api/faucet.ts → api/faucet.mjs (self-contained ESM)
 *   2. Remove api/faucet.ts so Vercel uses the .mjs bundle
 */
import { build } from 'esbuild';
import { unlinkSync } from 'fs';

await build({
    entryPoints: ['api/faucet.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'api/faucet.mjs',
    banner: {
        // createRequire shim for CJS dependencies that use require()
        js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    logOverride: {
        'commonjs-variable-in-esm': 'silent',
    },
});

// Remove the .ts source so Vercel picks up .mjs instead
try { unlinkSync('api/faucet.ts'); } catch { /* ignore */ }

console.log('  api/faucet.ts → api/faucet.mjs (bundled ESM)');
