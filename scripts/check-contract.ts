import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS || '';

async function main() {
    console.log('Checking OPNet testnet status...');
    console.log(`Contract: ${CONTRACT}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);

    // Check challenge (basic connectivity)
    try {
        const challenge = await provider.getChallenge();
        console.log(`\nRPC OK - Challenge difficulty: ${challenge.difficulty}`);
    } catch (e: any) {
        console.log(`\nRPC error: ${e.message}`);
    }

    // Check UTXOs for deployer
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (phrase) {
        const mnemonic = new Mnemonic(phrase, '', NETWORK);
        const wallet = mnemonic.derive(0);
        try {
            const utxos = await limitedProvider.fetchUTXO({
                address: wallet.p2tr,
                minAmount: 1_000n,
                requestedAmount: 100_000n,
            });
            const total = utxos.reduce((s, u) => s + u.value, 0n);
            console.log(`\nDeployer UTXOs: ${utxos.length}, total: ${total} sats`);
        } catch (e: any) {
            console.log(`\nUTXO fetch error: ${e.message}`);
        }
        wallet.zeroize();
    }

    // Check contract code
    if (CONTRACT) {
        try {
            const code = await provider.getCode(CONTRACT);
            console.log(`\nContract code: ${code ? 'FOUND' : 'NOT FOUND'}`);
            if (code && typeof code === 'object') {
                console.log(`  Keys: ${Object.keys(code).join(', ')}`);
            }
        } catch (e: any) {
            console.log(`\nContract code error: ${e.message?.slice(0, 200)}`);
        }
    }

    // Check pending TXs
    try {
        const pending = await provider.getLatestPendingTransactions();
        console.log(`\nPending TXs: ${Array.isArray(pending) ? pending.length : JSON.stringify(pending).slice(0, 200)}`);
    } catch (e: any) {
        console.log(`\nPending TXs error: ${e.message?.slice(0, 200)}`);
    }
}

main().catch(e => console.error('FATAL:', e));
