/**
 * Patches @noble/hashes v2 to be backwards-compatible with v1 import paths.
 * Only patches v2+ installations; v1 is left untouched.
 *
 * v2 changes:
 *   - sha256/sha512 moved into sha2.js
 *   - ripemd160 moved into legacy.js
 *   - extensionless imports dropped
 *
 * This script:
 * 1. Adds extensionless entries to the exports map (v2 only)
 * 2. Creates sha256.js, sha512.js, ripemd160.js shim files (v2 only)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ESM shims
const sha256Shim = `// Compatibility shim: v2 moved sha256 to sha2.js\nexport { sha256, sha224 } from "./sha2.js";\n`;
const sha512Shim = `// Compatibility shim: v2 moved sha512 to sha2.js\nexport { sha512, sha512_224, sha512_256, sha384 } from "./sha2.js";\n`;
const ripemd160Shim = `// Compatibility shim: v2 moved ripemd160 to legacy.js\nexport { ripemd160 } from "./legacy.js";\n`;
// CJS shims (for packages like bip39 that use require())
const sha256CjsShim = `// CJS compatibility shim\nconst sha2 = require("./sha2.js");\nmodule.exports = sha2;\n`;
const sha512CjsShim = `// CJS compatibility shim\nconst sha2 = require("./sha2.js");\nmodule.exports = sha2;\n`;
const ripemd160CjsShim = `// CJS compatibility shim\nconst legacy = require("./legacy.js");\nmodule.exports = legacy;\n`;

function patchDir(dir, label) {
    const pkgPath = resolve(dir, 'package.json');
    if (!existsSync(pkgPath)) return;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (!pkg.exports) return;

    // Only patch v2+ (v1 already has sha256.js, sha512.js, ripemd160.js natively)
    const major = parseInt(pkg.version?.split('.')[0] || '0', 10);
    if (major < 2) {
        // For v1, just add extensionless entries pointing to existing conditional exports
        const newExports = {};
        for (const [key, value] of Object.entries(pkg.exports)) {
            newExports[key] = value;
            if (key.endsWith('.js') && key !== '.') {
                const bare = key.replace(/\.js$/, '');
                if (!newExports[bare]) {
                    newExports[bare] = value;
                }
            }
        }
        pkg.exports = newExports;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`  ${label}: v${pkg.version} - added extensionless entries only`);
        return;
    }

    // v2+: add extensionless entries AND create shim files
    const newExports = {};
    for (const [key, value] of Object.entries(pkg.exports)) {
        newExports[key] = value;
        if (key.endsWith('.js') && key !== '.') {
            const bare = key.replace(/\.js$/, '');
            if (!newExports[bare]) {
                newExports[bare] = value;
            }
        }
    }

    // Add v1-compat shim entries (dual ESM/CJS)
    newExports['./sha256'] = { import: './sha256.js', require: './sha256.cjs', default: './sha256.js' };
    newExports['./sha512'] = { import: './sha512.js', require: './sha512.cjs', default: './sha512.js' };
    newExports['./ripemd160'] = { import: './ripemd160.js', require: './ripemd160.cjs', default: './ripemd160.js' };
    newExports['./pbkdf2'] = './pbkdf2.js';
    newExports['./hmac'] = './hmac.js';
    newExports['./hkdf'] = './hkdf.js';

    pkg.exports = newExports;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    // Create ESM shim files
    writeFileSync(resolve(dir, 'sha256.js'), sha256Shim);
    writeFileSync(resolve(dir, 'sha512.js'), sha512Shim);
    if (!existsSync(resolve(dir, 'ripemd160.js'))) {
        writeFileSync(resolve(dir, 'ripemd160.js'), ripemd160Shim);
    }

    // Create CJS shim files
    writeFileSync(resolve(dir, 'sha256.cjs'), sha256CjsShim);
    writeFileSync(resolve(dir, 'sha512.cjs'), sha512CjsShim);
    writeFileSync(resolve(dir, 'ripemd160.cjs'), ripemd160CjsShim);

    console.log(`  ${label}: v${pkg.version} - full v2->v1 compat patch applied`);
}

const base = import.meta.dirname ?? '.';

// Patch top-level @noble/hashes
patchDir(resolve(base, 'node_modules/@noble/hashes'), 'top-level');

// Patch nested copies
const nestedDirs = [
    'node_modules/@btc-vision/transaction/node_modules/@noble/hashes',
    'node_modules/@btc-vision/bip32/node_modules/@noble/hashes',
    'node_modules/opnet/node_modules/@noble/hashes',
];
for (const rel of nestedDirs) {
    patchDir(resolve(base, rel), rel.split('/').slice(1, 3).join('/'));
}

console.log('patch-noble-hashes: done');
