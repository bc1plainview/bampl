/**
 * Link ML-DSA key by using the opnet SDK's sendTransaction flow
 * which automatically includes linkMLDSAPublicKeyToAddress: true.
 *
 * The SDK handles contract/to/address derivation correctly,
 * unlike our manual signInteraction attempts.
 */
import 'dotenv/config';
import { OPNetLimitedProvider, Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';

const NETWORK = networks.testnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

// Active contracts on testnet (found from block scanning)
const TARGET_CONTRACTS = [
    'opt1sqqlnq2fg3lfcpdfrz25mmwkvvnvm2yca0vnw7use',
    'opt1sqrlh60uk97lm44y9svrjcrdcrl950egdsgepx9la',
    'opt1sqrnuuq6qkgllg0rd6pppjp3mfy4jsgur3s5hqm24',
    'opt1sqqavlf5dr8tjgrsrvjzhk5yrkgnha0z4ty9xwwf6',
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

    console.log('Linking ML-DSA key via contract interaction (SDK flow)...');
    console.log(`Deployer: ${wallet.p2tr}`);
    console.log(`Address: ${wallet.address.toHex()}`);

    for (const contractAddr of TARGET_CONTRACTS) {
        console.log(`\n--- Trying ${contractAddr} ---`);

        try {
            const contract = getContract(contractAddr, OP_20_ABI, provider, NETWORK);
            contract.setSender(wallet.address);

            // Try a WRITE function (view functions can't be sent as TX)
            let callResult: any = null;

            // Try increaseAllowance(wallet, 0) - a no-op write
            try {
                callResult = await (contract as any).increaseAllowance(wallet.address, 0n);
                if (callResult?.calldata) {
                    console.log('  increaseAllowance(self, 0) simulation OK');
                }
            } catch (e: any) {
                console.log(`  increaseAllowance: ${e.message?.slice(0, 80)}`);
            }

            // Fallback: try transfer to self with 0 amount
            if (!callResult?.calldata) {
                try {
                    callResult = await (contract as any).transfer(wallet.address, 0n);
                    if (callResult?.calldata) {
                        console.log('  transfer(self, 0) simulation OK');
                    }
                } catch (e: any) {
                    console.log(`  transfer: ${e.message?.slice(0, 80)}`);
                }
            }

            // Fallback: try burn(0)
            if (!callResult?.calldata) {
                try {
                    callResult = await (contract as any).burn(0n);
                    if (callResult?.calldata) {
                        console.log('  burn(0) simulation OK');
                    }
                } catch (e: any) {
                    console.log(`  burn: ${e.message?.slice(0, 80)}`);
                }
            }

            if (!callResult?.calldata) {
                console.log('  No valid write method found, skipping');
                continue;
            }

            // Use the SDK's sendTransaction which handles everything correctly
            console.log('  Sending transaction via SDK...');
            console.log('  (SDK defaults: linkMLDSAPublicKeyToAddress=true)');

            // For backend: signer and mldsaSigner must be provided
            const txResult = await callResult.sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                from: wallet.address, // Address object
                refundTo: wallet.p2tr, // P2TR string for refunds
                feeRate: 10,
                priorityFee: 10_000n,
                maximumAllowedSatToSpend: 500_000n, // max sats to spend on this TX
                network: NETWORK,
                // linkMLDSAPublicKeyToAddress defaults to true in SDK
            });

            if (!txResult) {
                console.log('  sendTransaction returned null');
                continue;
            }

            console.log('  Transaction built!');

            // Broadcast the transactions
            if (txResult.fundingTransaction) {
                const fundRes = await limitedProvider.broadcastTransaction(txResult.fundingTransaction, false);
                console.log(`  Funding TX: ${fundRes?.success ? 'OK' : 'FAILED'} ${fundRes?.result || fundRes?.error || ''}`);
                if (!fundRes?.success) continue;

                await new Promise((r) => setTimeout(r, 3000));
            }

            if (txResult.interactionTransaction) {
                const intRes = await limitedProvider.broadcastTransaction(txResult.interactionTransaction, false);
                console.log(`  Interaction TX: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);

                if (intRes?.success) {
                    console.log('\n  ML-DSA KEY LINKING INTERACTION BROADCAST!');
                    console.log(`  TX: ${intRes.result}`);
                    console.log('  Wait for block confirmation (~10 min), then deploy BAMPL.');
                    wallet.zeroize();
                    return;
                } else if (intRes && 'result' in intRes) {
                    const raw = (intRes as Record<string, unknown>).result;
                    if (typeof raw === 'string') {
                        try {
                            console.log(`  Revert: ${Buffer.from(raw, 'base64').toString('utf8')}`);
                        } catch { /* */ }
                    }
                }
            }

            // Check if the result has 'transaction' array (different format)
            if (txResult.transaction) {
                for (let i = 0; i < txResult.transaction.length; i++) {
                    const res = await limitedProvider.broadcastTransaction(txResult.transaction[i], false);
                    console.log(`  TX ${i + 1}: ${res?.success ? 'OK' : 'FAILED'} ${res?.result || res?.error || ''}`);
                    if (i < txResult.transaction.length - 1) await new Promise((r) => setTimeout(r, 2000));
                }
                console.log('\n  ML-DSA KEY LINKING INTERACTION BROADCAST!');
                wallet.zeroize();
                return;
            }
        } catch (e: any) {
            console.error(`  Error: ${e.message?.slice(0, 300)}`);
        }
    }

    console.log('\nAll attempts exhausted.');
    wallet.zeroize();
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
