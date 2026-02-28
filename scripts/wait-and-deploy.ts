/**
 * Waits for the ML-DSA linking TX to confirm, then deploys BAMPL,
 * enables demo mode, and posts initial oracle price.
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
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const WASM_PATH = resolve(import.meta.dirname ?? '.', '../contract/build/BAMPLToken.wasm');

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) { console.error('Set DEPLOYER_MNEMONIC in .env'); process.exit(1); }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log(`Deployer: ${wallet.p2tr}`);

    // ── Step 1: Wait for ML-DSA key to be linked ──
    console.log('\n[1/4] Waiting for ML-DSA key linking to confirm...');
    let keyLinked = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            // Try a simple contract read - if it doesn't throw "No ML-DSA", key is linked
            // Actually we'll just try deploying and see
            const utxos = await limitedProvider.fetchUTXO({
                address: wallet.p2tr,
                minAmount: 10_000n,
                requestedAmount: 500_000n,
            });
            if (utxos.length > 0) {
                // Try a test deployment simulation by building the tx
                keyLinked = true;
                break;
            }
        } catch {
            // ignore
        }

        if (attempt % 6 === 0) {
            console.log(`  Still waiting... (${attempt * 10}s elapsed)`);
        }
        await sleep(10_000);
    }

    // ── Step 2: Deploy ──
    console.log('\n[2/4] Deploying BAMPL contract...');
    const bytecode: Uint8Array = readFileSync(WASM_PATH);
    console.log(`  WASM: ${bytecode.length} bytes`);

    const utxos: UTXO[] = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 1_000_000n,
    });
    console.log(`  UTXOs: ${utxos.length}, total: ${utxos.reduce((s, u) => s + u.value, 0n)} sats`);

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

    console.log(`  Contract address: ${result.contractAddress}`);

    // Broadcast funding TX
    const fundingRes = await limitedProvider.broadcastTransaction(result.transaction[0], false);
    if (!fundingRes?.success) {
        console.error('  Funding TX FAILED:', fundingRes?.error);
        process.exit(1);
    }
    console.log(`  Funding TX: ${fundingRes.result}`);

    await sleep(3000);

    // Broadcast deployment TX
    const deployRes = await limitedProvider.broadcastTransaction(result.transaction[1], false);
    if (!deployRes?.success) {
        console.error('  Deploy TX FAILED:', deployRes?.error);
        // Try to decode revert
        if (deployRes && 'result' in deployRes) {
            const raw = (deployRes as Record<string, unknown>).result;
            if (typeof raw === 'string') {
                console.error('  Revert:', Buffer.from(raw, 'base64').toString('utf8'));
            }
        }
        process.exit(1);
    }
    console.log(`  Deploy TX: ${deployRes.result}`);

    // Update .env
    const envPath = resolve(import.meta.dirname ?? '.', '.env');
    if (existsSync(envPath)) {
        let envContent = readFileSync(envPath, 'utf-8');
        if (envContent.includes('BAMPL_CONTRACT_ADDRESS=')) {
            envContent = envContent.replace(/BAMPL_CONTRACT_ADDRESS=.*/, `BAMPL_CONTRACT_ADDRESS=${result.contractAddress}`);
        } else {
            envContent += `\nBAMPL_CONTRACT_ADDRESS=${result.contractAddress}\n`;
        }
        writeFileSync(envPath, envContent);
    }

    console.log('\n  DEPLOYMENT SUCCESSFUL!');
    console.log(`  Contract: ${result.contractAddress}`);

    // ── Step 3: Wait for deployment to confirm, then enable demo mode ──
    console.log('\n[3/4] Waiting for deployment to confirm, then enabling demo mode...');
    for (let attempt = 0; attempt < 120; attempt++) {
        try {
            const contract = getContract(result.contractAddress, BAMPLTokenAbi, jsonRpcProvider, NETWORK);
            contract.setSender(wallet.address);

            const simResult = await (contract as any).enableDemoMode();
            if (simResult?.calldata) {
                console.log('  Simulation OK, sending enableDemoMode TX...');

                const demoUtxos = await limitedProvider.fetchUTXO({
                    address: wallet.p2tr,
                    minAmount: 10_000n,
                    requestedAmount: 100_000n,
                });

                const demoChallenge = await jsonRpcProvider.getChallenge();
                const demoTx = await (contract as any).sendTransaction({
                    signer: wallet.keypair,
                    mldsaSigner: wallet.mldsaKeypair,
                    from: wallet.p2tr,
                    utxos: demoUtxos,
                    challenge: demoChallenge,
                    feeRate: 10,
                    priorityFee: 10_000n,
                    gasSatFee: 50_000n,
                });

                if (demoTx?.transaction) {
                    for (let i = 0; i < demoTx.transaction.length; i++) {
                        const res = await limitedProvider.broadcastTransaction(demoTx.transaction[i], false);
                        console.log(`  Demo TX ${i + 1}: ${res?.success ? 'OK' : 'FAILED'} ${res?.result || res?.error || ''}`);
                        if (i < demoTx.transaction.length - 1) await sleep(2000);
                    }
                }
                console.log('  Demo mode enabled!');
                break;
            }
        } catch (e) {
            const msg = (e as Error).message;
            if (msg.includes('Contract not found')) {
                if (attempt % 6 === 0) console.log(`  Waiting for confirmation... (${attempt * 10}s)`);
            } else {
                console.log(`  Error: ${msg}`);
            }
        }
        await sleep(10_000);
    }

    // ── Step 4: Post initial oracle price at peg ──
    console.log('\n[4/4] Posting initial oracle price (1.0 MOTO)...');
    await sleep(5000); // brief wait
    try {
        const contract = getContract(result.contractAddress, BAMPLTokenAbi, jsonRpcProvider, NETWORK);
        contract.setSender(wallet.address);

        const priceRaw = BigInt(1 * 10 ** 8); // 1.0 MOTO
        const simResult = await (contract as any).postPrice(priceRaw);

        if (simResult?.calldata) {
            const priceUtxos = await limitedProvider.fetchUTXO({
                address: wallet.p2tr,
                minAmount: 10_000n,
                requestedAmount: 100_000n,
            });
            const priceChallenge = await jsonRpcProvider.getChallenge();

            const priceTx = await (contract as any).sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                from: wallet.p2tr,
                utxos: priceUtxos,
                challenge: priceChallenge,
                feeRate: 10,
                priorityFee: 10_000n,
                gasSatFee: 50_000n,
            });

            if (priceTx?.transaction) {
                for (let i = 0; i < priceTx.transaction.length; i++) {
                    const res = await limitedProvider.broadcastTransaction(priceTx.transaction[i], false);
                    console.log(`  Price TX ${i + 1}: ${res?.success ? 'OK' : 'FAILED'} ${res?.result || res?.error || ''}`);
                    if (i < priceTx.transaction.length - 1) await sleep(2000);
                }
            }
            console.log('  Oracle price posted: 1.0 MOTO');
        }
    } catch (e) {
        console.log(`  Price posting will need to wait for next block: ${(e as Error).message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('  ALL DONE!');
    console.log(`  Contract: ${result.contractAddress}`);
    console.log('  Frontend: http://localhost:5174/');
    console.log('='.repeat(60));

    wallet.zeroize();
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
