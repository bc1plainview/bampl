import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    base: '/',
    plugins: [
        // Node.js polyfills MUST come first
        nodePolyfills({
            globals: { Buffer: true, global: true, process: true },
            overrides: { crypto: 'crypto-browserify' },
        }),
        react(),
    ],
    resolve: {
        alias: {
            global: 'global',
            undici: resolve(__dirname, 'node_modules/opnet/src/fetch/fetch-browser.js'),
        },
        mainFields: ['module', 'main', 'browser'],
        dedupe: ['@noble/curves', '@noble/hashes', '@scure/base', 'buffer', 'react', 'react-dom'],
    },
    build: {
        commonjsOptions: { strictRequires: true, transformMixedEsModules: true },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'js/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    const name = assetInfo.names?.[0] ?? '';
                    const ext = name.split('.').pop() ?? '';
                    if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) return 'images/[name][extname]';
                    if (/woff|woff2|eot|ttf|otf/i.test(ext)) return 'fonts/[name][extname]';
                    if (/css/i.test(ext)) return 'css/[name][extname]';
                    return 'assets/[name][extname]';
                },
                manualChunks(id) {
                    if (id.includes('crypto-browserify') || id.includes('randombytes')) return undefined;
                    if (id.includes('node_modules')) {
                        if (id.includes('@noble/curves')) return 'noble-curves';
                        if (id.includes('@noble/hashes')) return 'noble-hashes';
                        if (id.includes('@scure/')) return 'scure';
                        if (id.includes('@btc-vision/transaction')) return 'btc-transaction';
                        if (id.includes('@btc-vision/bitcoin')) return 'btc-bitcoin';
                        if (id.includes('@btc-vision/bip32')) return 'btc-bip32';
                        if (id.includes('@btc-vision/post-quantum')) return 'btc-post-quantum';
                        if (id.includes('@btc-vision/wallet-sdk')) return 'btc-wallet-sdk';
                        if (id.includes('@btc-vision/walletconnect')) return 'btc-walletconnect';
                        if (id.includes('opnet')) return 'opnet';
                        if (id.includes('react')) return 'react-vendor';
                    }
                    return undefined;
                },
            },
            external: [
                'node:crypto', 'node:buffer', 'node:stream', 'node:util',
                'node:path', 'node:fs', 'node:os', 'node:net', 'node:tls',
                'node:http', 'node:https', 'node:events', 'node:url',
                'node:zlib', 'node:worker_threads', 'node:child_process',
            ],
        },
    },
    optimizeDeps: {
        exclude: ['crypto-browserify'],
    },
});
