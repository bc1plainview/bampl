/**
 * Link ML-DSA key via the opnet SDK's sendTransaction flow.
 * Uses stable SDK (v1.7.31) with manual UTXO fetching (opt1 addresses)
 * and passes challenge + UTXOs directly to bypass internal UTXO manager.
 */
import 'dotenv/config';
import { OPNetLimitedProvider, Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';
import { bech32m } from '@scure/base';

const NETWORK = networks.testnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

function toOptAddress(tb1Addr: string): string {
    const decoded = bech32m.decode(tb1Addr);
    return bech32m.encode('opt', decoded.words);
}

// Known OP20 contracts on testnet (only use 2nd contract - 1st gives "Could not decode")
const TARGET_CONTRACTS = [
    'opt1sqrlh60uk97lm44y9svrjcrdcrl950egdsgepx9la',
];

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) {
        console.error('Set DEPLOYER_MNEMONIC in .env');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const provider = new JSONRpcProvider(RPC_URL, NETWORK);

    const optAddr = toOptAddress(wallet.p2tr);
    console.log('Linking ML-DSA key via contract interaction...');
    console.log(`Deployer (tb1): ${wallet.p2tr}`);
    console.log(`Deployer (opt): ${optAddr}`);
    console.log(`Address hex: ${wallet.address.toHex()}`);

    // 1. Fetch UTXOs manually using opt1 address
    console.log('\nFetching UTXOs...');
    const utxos = await limitedProvider.fetchUTXO({
        address: optAddr,
        minAmount: 100_000n,
    });
    if (!utxos?.length) {
        console.error('No UTXOs found!');
        process.exit(1);
    }
    const total = utxos.reduce((s: bigint, u: any) => s + BigInt(u.value), 0n);
    console.log(`UTXOs: ${utxos.length}, total: ${total} sats`);

    // 2. Fetch challenge from provider
    console.log('Fetching challenge...');
    const challenge = await provider.getChallenge();
    console.log(`Challenge epoch: ${challenge.epochNumber}, difficulty: ${challenge.difficulty}`);

    for (const contractAddr of TARGET_CONTRACTS) {
        console.log(`\n--- Trying ${contractAddr} ---`);

        try {
            const contract = getContract(contractAddr, OP_20_ABI, provider, NETWORK);
            contract.setSender(wallet.address);

            // Simulate a no-op write function
            let callResult: any = null;
            try {
                callResult = await (contract as any).increaseAllowance(wallet.address, 0n);
                if (callResult?.calldata) {
                    console.log('  increaseAllowance simulation OK');
                }
            } catch (e: any) {
                console.log(`  increaseAllowance: ${e.message?.slice(0, 80)}`);
            }

            if (!callResult?.calldata) {
                try {
                    callResult = await (contract as any).transfer(wallet.address, 0n);
                    if (callResult?.calldata) console.log('  transfer(self, 0) simulation OK');
                } catch (e: any) {
                    console.log(`  transfer: ${e.message?.slice(0, 80)}`);
                }
            }

            if (!callResult?.calldata) {
                console.log('  No valid write method found, skipping');
                continue;
            }

            // 3. Send transaction with pre-fetched UTXOs and challenge
            console.log('  Sending transaction via SDK (with pre-fetched UTXOs + challenge)...');

            const signedTx = await callResult.sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                from: wallet.address,
                refundTo: optAddr,  // Use opt1 address for refund
                sender: optAddr,    // Also set sender for any internal lookups
                feeRate: 100,
                priorityFee: 100_000n,
                maximumAllowedSatToSpend: 500_000n,
                network: NETWORK,
                utxos: utxos,       // Pre-fetched UTXOs (bypasses internal UTXO manager)
                challenge: challenge, // Pre-fetched challenge
                linkMLDSAPublicKeyToAddress: true,
            });

            if (!signedTx) {
                console.log('  sendTransaction returned null');
                continue;
            }

            console.log('  Transaction signed!');
            console.log('  signedTx keys:', Object.keys(signedTx));

            // Find the raw transactions in the signedTx object
            const fundingRaw = signedTx.fundingTransactionRaw || signedTx.fundingTransaction;
            const interactionRaw = signedTx.interactionTransactionRaw || signedTx.interactionTransaction;

            console.log('  fundingRaw type:', typeof fundingRaw, fundingRaw ? `(${fundingRaw.length || 'obj'})` : 'null');
            console.log('  interactionRaw type:', typeof interactionRaw, interactionRaw ? `(${interactionRaw.length || 'obj'})` : 'null');

            if (fundingRaw) {
                console.log('  Broadcasting funding TX...');
                const fundRes = await limitedProvider.broadcastTransaction(fundingRaw, false);
                console.log(`  Funding TX: ${fundRes?.success ? 'OK' : 'FAILED'} ${fundRes?.result || fundRes?.error || ''}`);
                if (!fundRes?.success) {
                    console.log('  Full response:', JSON.stringify(fundRes));
                    continue;
                }
                await new Promise((r) => setTimeout(r, 3000));
            }

            if (interactionRaw) {
                console.log('  Broadcasting interaction TX...');
                const intRes = await limitedProvider.broadcastTransaction(interactionRaw, false);
                console.log(`  Interaction TX: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);

                if (intRes?.success) {
                    console.log('\n  ML-DSA KEY LINKING INTERACTION BROADCAST!');
                    console.log(`  TX: ${intRes.result}`);
                    console.log('  Wait for block confirmation (~10 min), then deploy BAMPL.');
                    return;
                }

                // Decode revert
                const raw = (intRes as any)?.result;
                if (typeof raw === 'string') {
                    try {
                        console.log(`  Revert: ${Buffer.from(raw, 'base64').toString('utf8')}`);
                    } catch { /* */ }
                }
            }

            if (!fundingRaw && !interactionRaw) {
                console.log('  No recognizable TX fields found. Full signedTx:');
                for (const [k, v] of Object.entries(signedTx)) {
                    const vStr = typeof v === 'object' && v !== null
                        ? `[${typeof v}] keys: ${Object.keys(v).join(', ')}`.slice(0, 100)
                        : String(v).slice(0, 100);
                    console.log(`    ${k}: ${vStr}`);
                }
            }
        } catch (e: any) {
            console.error(`  Error: ${e.message?.slice(0, 300)}`);
        }
    }

    console.log('\nAll attempts exhausted.');
}

main().catch((err) => {
    console.error('FATAL:', err.message?.slice(0, 500));
    process.exit(1);
});
