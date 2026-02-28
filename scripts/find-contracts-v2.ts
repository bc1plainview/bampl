import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

async function main() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Get pending TXs with full details
    console.log('Getting pending transactions...\n');
    try {
        const pending = await provider.getLatestPendingTransactions();
        if (Array.isArray(pending)) {
            console.log(`Found ${pending.length} pending TXs\n`);
            for (const tx of pending) {
                const data = JSON.stringify(tx, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
                console.log(data.slice(0, 1000));
                console.log('---');
            }
        }
    } catch (e: any) {
        console.log(`Error: ${e.message?.slice(0, 200)}`);
    }

    // Try to get a block by number
    console.log('\n\nGetting block 2304...');
    try {
        const block = await provider.getBlock(2304n, true);
        if (block) {
            const data = JSON.stringify(block, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
            console.log(data.slice(0, 3000));
        }
    } catch (e: any) {
        console.log(`Error: ${e.message?.slice(0, 200)}`);
    }

    // Try to get block 2303 for contract addresses
    console.log('\n\nGetting block 2303...');
    try {
        const block = await provider.getBlock(2303n, true);
        if (block) {
            const data = JSON.stringify(block, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
            console.log(data.slice(0, 3000));
        }
    } catch (e: any) {
        console.log(`Error: ${e.message?.slice(0, 200)}`);
    }
}

main().catch(e => console.error('FATAL:', e));
