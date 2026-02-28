import 'dotenv/config';
import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
    const resp = await fetch(`${RPC_URL}/api/v1/json-rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    });
    if (!resp.ok) {
        // Try without the path
        const resp2 = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
        });
        const text = await resp2.text();
        return JSON.parse(text || '{}');
    }
    return resp.json();
}

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) { console.error('Set DEPLOYER_MNEMONIC in .env'); process.exit(1); }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);

    console.log(`P2TR: ${wallet.p2tr}`);
    console.log(`OPNet: ${wallet.address.toHex()}`);

    // Try various RPC methods to check ML-DSA status
    const methods = [
        ['blockchain_getPublicKeysInfoRaw', [wallet.p2tr]],
        ['blockchain_getPublicKeyInfo', [wallet.p2tr]],
        ['address_getMLDSAPublicKey', [wallet.p2tr]],
        ['blockchain_getBlockCount', []],
    ];

    for (const [method, params] of methods) {
        console.log(`\n--- ${method} ---`);
        try {
            const result = await rpcCall(method as string, params as unknown[]);
            console.log(JSON.stringify(result, null, 2)?.slice(0, 500));
        } catch (e: any) {
            console.log('Error:', e.message?.slice(0, 200));
        }
    }

    wallet.zeroize();
}

main().catch(e => console.error('FATAL:', e));
