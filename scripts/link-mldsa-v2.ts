/**
 * Link ML-DSA key by sending an interaction TX with ML-DSA link flags.
 *
 * Since createBTCTransfer (FundingTransaction) does NOT support ML-DSA features,
 * we use signInteraction which creates an InteractionTransaction that DOES.
 *
 * The interaction target doesn't need to exist - the ML-DSA link feature
 * is processed at the protocol level regardless of VM execution result.
 */
import 'dotenv/config';
import { TransactionFactory, OPNetLimitedProvider, Mnemonic, type UTXO } from '@btc-vision/transaction';
import { networks, crypto as btcCrypto } from '@btc-vision/bitcoin';
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
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log('Linking ML-DSA key via interaction TX...');
    console.log(`Deployer: ${wallet.p2tr}`);

    // Get UTXOs
    const utxos: UTXO[] = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 200_000n,
    });
    if (utxos.length === 0) {
        console.error('No UTXOs found');
        process.exit(1);
    }
    const total = utxos.reduce((s, u) => s + u.value, 0n);
    console.log(`UTXOs: ${utxos.length}, total: ${total} sats`);

    // Get challenge
    const challenge = await jsonRpcProvider.getChallenge();
    console.log(`Challenge obtained`);

    const factory = new TransactionFactory();

    // Use a dummy contract address (32 random bytes as hex)
    // The contract doesn't need to exist - we just need the TX structure
    const hashBytes = btcCrypto.sha256(Buffer.from('mldsa-key-link-dummy'));
    const dummyContractHex = Buffer.from(hashBytes).toString('hex');

    // Minimal calldata - just 4 zero bytes (function selector)
    const calldata = new Uint8Array(4);

    console.log(`\nBuilding interaction TX...`);
    console.log(`  Dummy contract: 0x${dummyContractHex}`);

    try {
        const result = await factory.signInteraction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network: NETWORK,
            from: wallet.p2tr,
            to: wallet.p2tr, // target address (self)
            contract: `0x${dummyContractHex}`,
            calldata,
            utxos,
            challenge,
            feeRate: 10,
            priorityFee: 10_000n,
            gasSatFee: 50_000n,
            revealMLDSAPublicKey: true,
            linkMLDSAPublicKeyToAddress: true,
        });

        console.log('  Interaction TX built successfully!');

        // Broadcast funding TX
        console.log('\nBroadcasting funding TX...');
        const fundingRes = await limitedProvider.broadcastTransaction(result.fundingTransaction, false);
        if (!fundingRes?.success) {
            console.error('  Funding TX failed:', fundingRes?.error);

            // Try to decode revert
            if (fundingRes && 'result' in fundingRes) {
                const raw = (fundingRes as Record<string, unknown>).result;
                if (typeof raw === 'string') {
                    try {
                        console.error('  Revert:', Buffer.from(raw, 'base64').toString('utf8'));
                    } catch {
                        console.error('  Raw:', raw);
                    }
                }
            }
            process.exit(1);
        }
        console.log(`  Funding TX OK: ${fundingRes.result}`);

        // Wait for propagation
        await new Promise((r) => setTimeout(r, 3000));

        // Broadcast interaction TX
        console.log('Broadcasting interaction TX (with ML-DSA link feature)...');
        const intRes = await limitedProvider.broadcastTransaction(result.interactionTransaction, false);
        console.log(`  Result: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);

        if (intRes?.success) {
            console.log('\n  ML-DSA KEY LINKING TX BROADCAST OK!');
            console.log(`  TX Hash: ${intRes.result}`);
            console.log('  Wait for block confirmation (~10 min), then deploy.');
        } else {
            // Even if the broadcast says failed, try to decode the result
            if (intRes && 'result' in intRes) {
                const raw = (intRes as Record<string, unknown>).result;
                if (typeof raw === 'string') {
                    try {
                        console.error('  Revert:', Buffer.from(raw, 'base64').toString('utf8'));
                    } catch {
                        console.error('  Raw:', raw);
                    }
                }
            }
            console.log('\n  Even if the VM reverted, the ML-DSA link feature may still be processed.');
            console.log('  Check key status after next block.');
        }
    } catch (e: any) {
        console.error('Error:', e.message);
    }

    wallet.zeroize();
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
