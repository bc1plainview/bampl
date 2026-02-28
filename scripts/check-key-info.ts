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

    console.log(`P2TR: ${wallet.p2tr}`);
    console.log(`OPNet: ${wallet.address.toHex()}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Use getPublicKeysInfoRaw to get raw data
    console.log('\n--- Raw Public Key Info ---');
    try {
        const raw = await provider.getPublicKeysInfoRaw(wallet.p2tr);
        console.log(JSON.stringify(raw, null, 2));
    } catch (e: any) {
        console.log('Error:', e.message?.slice(0, 300));
    }

    // Also try with isContract=false
    console.log('\n--- getPublicKeysInfo (isContract=false) ---');
    try {
        const info = await provider.getPublicKeysInfo(wallet.p2tr, false, true);
        console.log('Keys:', Object.keys(info));
        for (const [key, value] of Object.entries(info)) {
            console.log(`  ${key}:`, JSON.stringify(value, (_, v) => {
                if (v instanceof Uint8Array) return `Uint8Array(${v.length})`;
                if (typeof v === 'bigint') return v.toString();
                return v;
            }, 2)?.slice(0, 500));
        }
    } catch (e: any) {
        console.log('Error:', e.message?.slice(0, 300));
    }

    wallet.zeroize();
}

main().catch(e => console.error('FATAL:', e));
