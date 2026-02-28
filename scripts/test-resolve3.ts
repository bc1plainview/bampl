import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

async function main() {
    // Test with a known-good address that HAS ML-DSA keys (deployer)
    const goodAddr = 'opt1pfmn8j0lfufc8askgjfkl8jp5z045pnjd94tx2s9x6rq3nrxl6syqadhlf4';

    console.log('=== Testing with deployer address (has ML-DSA) ===');
    const rawGood = await p.getPublicKeysInfoRaw(goodAddr);
    console.log('Raw keys:', JSON.stringify(rawGood, null, 2));

    // Also try getPublicKeyInfo (singular, the one that worked in frontend)
    try {
        const info = await p.getPublicKeyInfo(goodAddr, false);
        console.log('getPublicKeyInfo type:', typeof info);
        console.log('getPublicKeyInfo constructor:', info?.constructor?.name);
        console.log('getPublicKeyInfo keys:', Object.keys(info || {}));
    } catch (e) {
        console.log('getPublicKeyInfo error:', (e as Error).message?.slice(0, 200));
    }

    // Test: can Address be created from just tweaked pubkey with empty MLDSA?
    console.log('\n=== Testing Address construction ===');

    // Check Address.fromString signature
    console.log('Address.fromString params:', Address.fromString.length);

    // Try with empty buffer for MLDSA
    try {
        const emptyMldsa = '0x' + '00'.repeat(1952); // ML-DSA-65 length
        const tweaked = '0xa8c70894ea447fb7877159d6b2f8d12a6d399b0b8c717d93dd1a0f8c40c5047c';
        const addr = Address.fromString(emptyMldsa, tweaked);
        console.log('Empty MLDSA address created:', !!addr);
    } catch (e) {
        console.log('Empty MLDSA error:', (e as Error).message?.slice(0, 200));
    }
}

main().catch(e => console.error('Fatal:', (e as Error).message?.slice(0, 300)));
