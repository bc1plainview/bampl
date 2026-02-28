/**
 * Split a single large UTXO into many smaller ones for rapid-fire demos.
 * Uses TransactionFactory to create a BTC self-send with many outputs.
 */
import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider, TransactionFactory } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const limitedProvider = new OPNetLimitedProvider(RPC_URL);

const NUM_SPLITS = parseInt(process.argv[2] || '15', 10);
const AMOUNT_PER = 5_000_000n; // 0.05 BTC per UTXO = plenty for contract calls

async function main() {
    console.log(`Splitting UTXOs into ${NUM_SPLITS} x ${AMOUNT_PER} sats`);
    console.log('Wallet:', wallet.p2tr);

    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    console.log(`Current UTXOs: ${utxos.length}, total: ${utxos.reduce((s: bigint, u: { value: bigint }) => s + u.value, 0n)} sats`);

    if (utxos.length >= NUM_SPLITS) {
        console.log('Already have enough UTXOs, no split needed');
        return;
    }

    const factory = new TransactionFactory();

    // Build extra outputs for the split
    const extraOutputs = [];
    for (let i = 0; i < NUM_SPLITS - 1; i++) {
        extraOutputs.push({
            to: wallet.p2tr,
            value: AMOUNT_PER,
        });
    }

    console.log(`Creating ${extraOutputs.length} extra outputs...`);

    const tx = await factory.createBTCTransfer({
        from: wallet.p2tr,
        to: wallet.p2tr,
        utxos,
        signer: wallet.keypair,
        network: NETWORK,
        feeRate: 30,
        priorityFee: 0n,
        amount: AMOUNT_PER,
        extraOutputs,
    });

    console.log('Broadcasting split TX...');
    const result = await limitedProvider.broadcastTransaction(tx.rawTransaction, false);
    console.log('Result:', JSON.stringify(result));

    if (result?.success) {
        console.log(`\nSplit into ${NUM_SPLITS} UTXOs. Wait for next block or use immediately (mempool UTXOs).`);
    }
}

main().catch(err => console.error('Error:', (err as Error).message?.slice(0, 500)));
