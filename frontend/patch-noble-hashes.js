/**
 * Patches @noble/hashes to be compatible with both v1 and v2 import paths.
 *
 * OPNet packages import v2-style paths (e.g., @noble/hashes/sha2.js)
 * while bip39 uses v1-style CJS paths (e.g., require('@noble/hashes/sha256')).
 *
 * For v1: adds extensionless entries + v2-style sha2.js shim
 * For v2: adds v1-style sha256.js/sha512.js shims (ESM + CJS)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// v2-style sha2.js shim for v1 installations
// v1 has sha256.js and sha512.js separately; v2 merged them into sha2.js
const sha2ShimForV1 = `// Shim: re-export v1 sha256/sha512 as v2 sha2 format
"use strict";
var sha256_1 = require("./sha256.js");
var sha512_1 = require("./sha512.js");
module.exports.sha256 = sha256_1.sha256;
module.exports.sha224 = sha256_1.sha224;
module.exports.sha512 = sha512_1.sha512;
module.exports.sha384 = sha512_1.sha384;
if (sha512_1.sha512_224) module.exports.sha512_224 = sha512_1.sha512_224;
if (sha512_1.sha512_256) module.exports.sha512_256 = sha512_1.sha512_256;
`;

// legacy.js shim for v1 (v2 moved ripemd160 into legacy.js)
const legacyShimForV1 = `// Shim: re-export v1 ripemd160 as v2 legacy format
"use strict";
var ripemd160_1 = require("./ripemd160.js");
module.exports.ripemd160 = ripemd160_1.ripemd160;
`;

// v1-style shims for v2 installations (ESM)
const sha256ShimForV2 = `// Compatibility shim: v2 moved sha256 to sha2.js\nexport { sha256, sha224 } from "./sha2.js";\n`;
const sha512ShimForV2 = `// Compatibility shim: v2 moved sha512 to sha2.js\nexport { sha512, sha512_224, sha512_256, sha384 } from "./sha2.js";\n`;
const ripemd160ShimForV2 = `// Compatibility shim: v2 moved ripemd160 to legacy.js\nexport { ripemd160 } from "./legacy.js";\n`;

function patchDir(dir, label) {
    const pkgPath = resolve(dir, 'package.json');
    if (!existsSync(pkgPath)) return;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (!pkg.exports) return;

    const major = parseInt(pkg.version?.split('.')[0] || '0', 10);

    // Build new exports map with extensionless entries
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

    if (major < 2) {
        // v1: add v2-style paths (sha2.js, legacy.js)
        newExports['./sha2'] = './sha2.js';
        newExports['./sha2.js'] = './sha2.js';
        newExports['./legacy'] = './legacy.js';
        newExports['./legacy.js'] = './legacy.js';

        pkg.exports = newExports;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

        // Create v2-style shim files
        writeFileSync(resolve(dir, 'sha2.js'), sha2ShimForV1);
        if (!existsSync(resolve(dir, 'legacy.js'))) {
            writeFileSync(resolve(dir, 'legacy.js'), legacyShimForV1);
        }

        console.log(`  ${label}: v${pkg.version} - added extensionless + v2-style shims`);
    } else {
        // v2: add v1-style paths (sha256.js, sha512.js, ripemd160.js)
        newExports['./sha256'] = './sha256.js';
        newExports['./sha512'] = './sha512.js';
        newExports['./ripemd160'] = './ripemd160.js';
        newExports['./pbkdf2'] = './pbkdf2.js';
        newExports['./hmac'] = './hmac.js';
        newExports['./hkdf'] = './hkdf.js';

        pkg.exports = newExports;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

        // Create v1-style shim files (ESM)
        writeFileSync(resolve(dir, 'sha256.js'), sha256ShimForV2);
        writeFileSync(resolve(dir, 'sha512.js'), sha512ShimForV2);
        if (!existsSync(resolve(dir, 'ripemd160.js'))) {
            writeFileSync(resolve(dir, 'ripemd160.js'), ripemd160ShimForV2);
        }

        console.log(`  ${label}: v${pkg.version} - full v2->v1 compat patch applied`);
    }
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
