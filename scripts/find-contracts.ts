import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

async function main() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Get latest block
    console.log('Searching for existing contracts on testnet...\n');

    // Try to get recent blocks
    for (let offset = 0; offset < 10; offset++) {
        try {
            const block = await provider.getLatestBlock(true, offset);
            if (block) {
                console.log(`Block #${(block as any).height || (block as any).blockNumber || '?'}:`);
                console.log(`  Hash: ${(block as any).hash?.slice(0, 20) || '?'}...`);
                const txCount = (block as any).transactions?.length || 0;
                console.log(`  Transactions: ${txCount}`);

                if ((block as any).transactions) {
                    for (const tx of (block as any).transactions.slice(0, 5)) {
                        const addr = tx.contractAddress || tx.to || '';
                        const type = tx.type || tx.transactionType || '';
                        if (addr) {
                            console.log(`    Contract: ${addr} (type: ${type})`);
                        }
                    }
                }
                console.log();
            }
        } catch (e: any) {
            if (offset === 0) console.log(`getLatestBlock error: ${e.message?.slice(0, 200)}`);
            break;
        }
    }

    // Try to search for any known tokens
    const potentialContracts = [
        // Common OP20 token patterns
        'bcrt1q',
    ];

    // Try getting code for our previous deployment addresses
    const tryAddrs = [
        'opt1sqra07v3clulmps9krt57rngcthad2wxlyqqxrhzl', // First deploy (reverted)
        'opt1sqp8as2epqxqj7m33naaqeqtkh3mh8ck8wskn5fg0', // Second deploy (reverted)
    ];

    console.log('Checking previous deployment addresses:');
    for (const addr of tryAddrs) {
        try {
            const code = await provider.getCode(addr);
            console.log(`  ${addr}: ${code ? 'HAS CODE' : 'No code'}`);
        } catch (e: any) {
            console.log(`  ${addr}: ${e.message?.slice(0, 100)}`);
        }
    }

    // Check pending TXs for contract addresses
    console.log('\nPending transactions:');
    try {
        const pending = await provider.getLatestPendingTransactions();
        if (Array.isArray(pending)) {
            for (const tx of pending) {
                const data = JSON.stringify(tx, (_, v) => typeof v === 'bigint' ? v.toString() : v);
                console.log(`  ${data.slice(0, 200)}`);
            }
        }
    } catch (e: any) {
        console.log(`  Error: ${e.message?.slice(0, 200)}`);
    }
}

main().catch(e => console.error('FATAL:', e));
