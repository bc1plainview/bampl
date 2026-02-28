import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

async function main() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Get block 2303 with prefetched TXs
    console.log('Getting block 2303 transactions...\n');
    try {
        const block = await provider.getBlock(2303n, true);
        if (block && (block as any).transactions) {
            const txs = (block as any).transactions;
            console.log(`${txs.length} transactions in block 2303\n`);
            for (const tx of txs) {
                const compact = {
                    hash: tx.hash || tx.id,
                    type: tx.transactionType || tx.type,
                    contractAddress: tx.contractAddress,
                    from: tx.from,
                    to: tx.to,
                    gasUsed: tx.gasUsed?.toString(),
                };
                console.log(JSON.stringify(compact));
            }
        }
    } catch (e: any) {
        console.log(`Error: ${e.message?.slice(0, 200)}`);
    }

    // Also try getting individual transaction receipts from block
    console.log('\n\nLooking for contracts via transaction receipts...');
    // Try getting a recent interaction TX
    const pendingTxId = '06625f59a1aa1ebac43b8ce68262412c8620b671db20c00c0414d557b7d7f3a6';
    try {
        const tx = await provider.getTransaction(pendingTxId);
        if (tx) {
            console.log('\nPending interaction TX details:');
            console.log(JSON.stringify(tx, (_, v) => {
                if (typeof v === 'bigint') return v.toString();
                if (v instanceof Uint8Array) return `Uint8Array(${v.length})`;
                return v;
            }, 2)?.slice(0, 1500));
        }
    } catch (e: any) {
        console.log(`Error: ${e.message?.slice(0, 200)}`);
    }

    // Try to get blocks 2302, 2301, etc. to find contract interactions
    for (let blockNum = 2302; blockNum >= 2298; blockNum--) {
        console.log(`\nBlock ${blockNum}:`);
        try {
            const block = await provider.getBlock(BigInt(blockNum), true);
            if (block && (block as any).transactions) {
                const txs = (block as any).transactions;
                for (const tx of txs) {
                    if (tx.contractAddress || tx.transactionType === 'Interaction' || tx.transactionType === 'Deployment') {
                        console.log(`  TX ${tx.hash?.slice(0, 16)}... type=${tx.transactionType} contract=${tx.contractAddress || 'N/A'}`);
                    }
                }
                if (txs.length === 0 || !txs.some((t: any) => t.contractAddress)) {
                    console.log(`  ${txs.length} TXs (no contracts found)`);
                }
            }
        } catch (e: any) {
            console.log(`  Error: ${e.message?.slice(0, 100)}`);
        }
    }
}

main().catch(e => console.error('FATAL:', e));
