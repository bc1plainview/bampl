/**
 * Waits for a new block (ML-DSA key linking confirm), then deploys BAMPL.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
    TransactionFactory,
    OPNetLimitedProvider,
    Mnemonic,
    type UTXO,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const WASM_PATH = resolve(import.meta.dirname ?? '.', '../contract/build/BAMPLToken.wasm');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getBlockHeight(provider: JSONRpcProvider): Promise<bigint> {
    // Use the raw RPC call
    const block = await (provider as any).provider.call('blockchain_getBlockCount', []);
    return BigInt(block);
}

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) { console.error('Set DEPLOYER_MNEMONIC in .env'); process.exit(1); }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log(`Deployer: ${wallet.p2tr}`);

    // Get current block height
    let currentHeight: bigint;
    try {
        currentHeight = await getBlockHeight(jsonRpcProvider);
        console.log(`Current block height: ${currentHeight}`);
    } catch (e) {
        console.log('Could not get block height via provider, will poll via deployment attempts');
        currentHeight = 0n;
    }

    // ── Wait for next block ──
    console.log('\nWaiting for next block (ML-DSA key linking must confirm first)...');
    console.log('Signet blocks are ~10 minutes apart. Please be patient.\n');

    let blockConfirmed = false;
    for (let i = 0; i < 180; i++) { // up to 30 minutes
        // Try deployment every 10 seconds
        try {
            const utxos: UTXO[] = await limitedProvider.fetchUTXO({
                address: wallet.p2tr,
                minAmount: 10_000n,
                requestedAmount: 1_000_000n,
            });

            if (utxos.length === 0) {
                console.log(`  [${i * 10}s] No UTXOs yet...`);
                await sleep(10_000);
                continue;
            }

            const bytecode: Uint8Array = readFileSync(WASM_PATH);
            const challenge = await jsonRpcProvider.getChallenge();
            const factory = new TransactionFactory();

            const result = await factory.signDeployment({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                network: NETWORK,
                from: wallet.p2tr,
                bytecode,
                utxos,
                challenge,
                feeRate: 10,
                priorityFee: 10_000n,
                gasSatFee: 100_000n,
            });

            // Broadcast funding
            const fundingRes = await limitedProvider.broadcastTransaction(result.transaction[0], false);
            if (!fundingRes?.success) {
                console.log(`  [${i * 10}s] Funding TX failed, retrying...`);
                await sleep(10_000);
                continue;
            }

            await sleep(3000);

            // Broadcast deploy
            const deployRes = await limitedProvider.broadcastTransaction(result.transaction[1], false);
            if (deployRes?.success) {
                console.log(`\n  DEPLOYMENT SUCCESSFUL!`);
                console.log(`  Contract: ${result.contractAddress}`);
                console.log(`  Deploy TX: ${deployRes.result}`);

                // Update .env
                const envPath = resolve(import.meta.dirname ?? '.', '.env');
                if (existsSync(envPath)) {
                    let env = readFileSync(envPath, 'utf-8');
                    if (env.includes('BAMPL_CONTRACT_ADDRESS=')) {
                        env = env.replace(/BAMPL_CONTRACT_ADDRESS=.*/, `BAMPL_CONTRACT_ADDRESS=${result.contractAddress}`);
                    } else {
                        env += `\nBAMPL_CONTRACT_ADDRESS=${result.contractAddress}\n`;
                    }
                    writeFileSync(envPath, env);
                }

                blockConfirmed = true;
                break;
            } else {
                // Decode revert to check if still ML-DSA issue
                let revertMsg = '';
                if (deployRes && 'result' in deployRes) {
                    const raw = (deployRes as Record<string, unknown>).result;
                    if (typeof raw === 'string') {
                        revertMsg = Buffer.from(raw, 'base64').toString('utf8');
                    }
                }

                if (revertMsg.includes('ML-DSA') || revertMsg.includes('No ML')) {
                    if (i % 6 === 0) console.log(`  [${i * 10}s] ML-DSA key not yet confirmed in a block, waiting...`);
                } else {
                    console.log(`  [${i * 10}s] Deploy failed: ${revertMsg || deployRes?.error || 'unknown'}`);
                }
            }
        } catch (e) {
            if (i % 6 === 0) console.log(`  [${i * 10}s] ${(e as Error).message.slice(0, 80)}`);
        }
        await sleep(10_000);
    }

    if (!blockConfirmed) {
        console.error('\nTimed out waiting for block confirmation. Try again later:');
        console.error('  npx tsx deploy-after-block.ts');
        process.exit(1);
    }

    wallet.zeroize();
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
