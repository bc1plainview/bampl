import 'dotenv/config';
import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) { console.error('Set DEPLOYER_MNEMONIC in .env'); process.exit(1); }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);

    console.log('Checking ML-DSA key status...');
    console.log(`P2TR: ${wallet.p2tr}`);
    console.log(`OPNet Address: ${wallet.address.toHex()}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Check public key info
    console.log('\n--- Public Key Info ---');
    try {
        const info = await provider.getPublicKeyInfo(wallet.p2tr);
        console.log('Result:', JSON.stringify(info, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e: any) {
        console.log('Error:', e.message?.slice(0, 300));
    }

    // Try getPublicKeyInfo with the OPNet address
    console.log('\n--- Public Key Info (OPNet address) ---');
    try {
        const info = await provider.getPublicKeyInfo(wallet.address.toHex());
        console.log('Result:', JSON.stringify(info, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e: any) {
        console.log('Error:', e.message?.slice(0, 300));
    }

    // Check if there are any methods to list contracts or check key links
    console.log('\n--- Provider methods ---');
    const proto = Object.getPrototypeOf(provider);
    const methods = Object.getOwnPropertyNames(proto)
        .filter(m => typeof (provider as any)[m] === 'function' && !m.startsWith('_'))
        .sort();
    console.log(methods.join(', '));

    wallet.zeroize();
}

main().catch(e => console.error('FATAL:', e));
