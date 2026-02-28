/**
 * Custom build script for Vercel Build Output API v3.
 *
 * Produces .vercel/output/ with:
 *   - config.json (routing)
 *   - static/ (Vite build output)
 *   - functions/api/faucet.func/ (esbuild-bundled serverless function)
 *
 * This avoids the ESM/CJS conflicts that occur when Vercel's
 * default @vercel/node runtime tries to trace and load the
 * @noble/hashes v2 + bip39 v3 dependency combination.
 */
import { execSync } from 'child_process';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, cpSync } from 'fs';

// Step 1: Build frontend with Vite
console.log('Building frontend with Vite...');
execSync('npx vite build', { stdio: 'inherit' });

// Step 2: Bundle serverless function with esbuild
console.log('Bundling serverless function...');
const funcDir = '.vercel/output/functions/api/faucet.func';
mkdirSync(funcDir, { recursive: true });

await build({
    entryPoints: ['api/faucet.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: `${funcDir}/index.mjs`,
    banner: {
        js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    logOverride: {
        'commonjs-variable-in-esm': 'silent',
    },
});

// Write the function config
writeFileSync(`${funcDir}/.vc-config.json`, JSON.stringify({
    runtime: 'nodejs18.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    maxDuration: 30,
}, null, 2));

console.log('  api/faucet.ts → functions/api/faucet.func/index.mjs');

// Step 3: Assemble Build Output API v3 structure
const outputDir = '.vercel/output';
mkdirSync(`${outputDir}/static`, { recursive: true });

// Copy Vite build output to static/
cpSync('dist', `${outputDir}/static`, { recursive: true });

// Write config.json with routing rules
writeFileSync(`${outputDir}/config.json`, JSON.stringify({
    version: 3,
    routes: [
        // API routes first
        { src: '/api/faucet', dest: '/api/faucet' },
        // SPA fallback for frontend routes
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
    ],
}, null, 2));

console.log('Build complete. Output at .vercel/output/');
