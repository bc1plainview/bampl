/**
 * Link ML-DSA public key to the deployer address.
 * This must be done before any contract deployment or interaction.
 * Sends a small self-transfer with revealMLDSAPublicKey + linkMLDSAPublicKeyToAddress flags.
 */
import 'dotenv/config';
import { TransactionFactory, OPNetLimitedProvider, Mnemonic, type UTXO } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) {
        console.error('Set DEPLOYER_MNEMONIC in .env');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);

    console.log('Linking ML-DSA public key to address...');
    console.log(`Address: ${wallet.p2tr}`);

    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Fetch UTXOs
    const utxos: UTXO[] = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 100_000n,
    });

    if (utxos.length === 0) {
        console.error('No UTXOs found');
        process.exit(1);
    }

    const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0n);
    console.log(`Found ${utxos.length} UTXO(s), total: ${totalBalance} sats`);

    // Create a simple funding/self-transfer transaction with ML-DSA linking
    const factory = new TransactionFactory();

    const result = await factory.createBTCTransfer({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: NETWORK,
        from: wallet.p2tr,
        to: wallet.p2tr,
        utxos: utxos,
        amount: 50_000n, // small self-transfer
        feeRate: 10,
        priorityFee: 1_000n,
        gasSatFee: 1_000n,
        revealMLDSAPublicKey: true,
        linkMLDSAPublicKeyToAddress: true,
    });

    console.log('\nML-DSA linking transaction built');
    console.log(`  TX size: ${result.tx.length / 2} bytes`);

    // Broadcast
    console.log('Broadcasting...');
    const broadcastResult = await limitedProvider.broadcastTransaction(
        result.tx,
        false,
    );

    if (!broadcastResult || !broadcastResult.success) {
        console.error('Broadcast failed:', broadcastResult?.error || 'unknown error');
        if (broadcastResult && 'result' in broadcastResult) {
            const raw = (broadcastResult as Record<string, unknown>).result;
            if (typeof raw === 'string') {
                try {
                    console.error('Revert:', Buffer.from(raw, 'base64').toString('utf8'));
                } catch {
                    console.error('Raw result:', raw);
                }
            }
        }
        process.exit(1);
    }

    console.log(`  TX broadcast OK: ${broadcastResult.result}`);
    console.log('\nML-DSA key linked! Wait for block confirmation before deploying.');

    wallet.zeroize();
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
