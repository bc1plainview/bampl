/**
 * BAMPL Token Deployment Script
 *
 * Deploys the BAMPL elastic supply token contract to OPNet Testnet.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in DEPLOYER_WIF
 *   2. Ensure the WASM is compiled at ../contract/build/BAMPLToken.wasm
 *   3. Run: npx tsx deploy.ts
 *
 * The deployment uses the two-transaction model:
 *   - Transaction 1: Funding TX (creates the UTXO the deployment consumes)
 *   - Transaction 2: Deployment TX (contains the WASM bytecode)
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import {
    TransactionFactory,
    OPNetLimitedProvider,
    Mnemonic,
    Wallet,
    type UTXO,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const DEPLOYER_WIF = process.env.DEPLOYER_WIF;

// Gas / fee parameters -- WASM contracts are large, need substantial gas
const GAS_SAT_FEE = 100_000n; // High gas for large WASM deployment
const PRIORITY_FEE = 10_000n;
const FEE_RATE = 10; // sat/vB

// UTXO parameters
const MIN_UTXO_AMOUNT = 10_000n;
const REQUESTED_AMOUNT = 1_000_000n; // Request ~0.01 BTC to cover deployment

// Path to compiled WASM
const WASM_PATH = resolve(import.meta.dirname ?? '.', '../contract/build/BAMPLToken.wasm');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeRevert(revertBase64: string): string {
    try {
        const buf = Buffer.from(revertBase64, 'base64');
        return buf.toString('utf-8');
    } catch {
        return revertBase64;
    }
}

function banner(text: string): void {
    const line = '='.repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${text}`);
    console.log(`${line}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    banner('BAMPL Token Deployment -- OPNet Testnet');

    // -----------------------------------------------------------------------
    // 1. Validate environment
    // -----------------------------------------------------------------------
    const hasMnemonic = !!process.env.DEPLOYER_MNEMONIC;
    const hasWif = !!DEPLOYER_WIF && DEPLOYER_WIF !== 'your_wif_key_here';

    if (!hasMnemonic && !hasWif) {
        console.error('ERROR: No wallet credentials found in .env');
        console.error('  Set either DEPLOYER_MNEMONIC or (DEPLOYER_WIF + DEPLOYER_QUANTUM_KEY).');
        console.error('  Copy .env.example to .env and fill in your credentials.');
        process.exit(1);
    }

    if (!existsSync(WASM_PATH)) {
        console.error(`ERROR: WASM file not found at ${WASM_PATH}`);
        console.error('  Make sure the contract is compiled first.');
        process.exit(1);
    }

    // -----------------------------------------------------------------------
    // 2. Load WASM bytecode
    // -----------------------------------------------------------------------
    const bytecode: Uint8Array = readFileSync(WASM_PATH);
    console.log(`Loaded WASM bytecode: ${bytecode.length} bytes (${(bytecode.length / 1024).toFixed(1)} KB)`);

    if (bytecode.length > 100_000) {
        console.log('WARNING: Large WASM file. Gas fee may need to be higher.');
    }

    // -----------------------------------------------------------------------
    // 3. Set up wallet from WIF
    // -----------------------------------------------------------------------
    // NOTE: OPNet requires both a classical (secp256k1) signer and a quantum
    // (ML-DSA) signer. Wallet.fromWif() needs both the WIF and the quantum
    // private key hex. If you only have a mnemonic, use Mnemonic instead.
    //
    // TODO: If Wallet.fromWif requires a quantum private key hex that you do
    // not have, switch to Mnemonic-based derivation. The mnemonic approach
    // automatically derives both classical and quantum keys:
    //
    //   const mnemonic = new Mnemonic(phrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    //   const wallet = mnemonic.derive(0);
    //
    // For now we attempt Mnemonic-based wallet creation. If you have a mnemonic
    // phrase, set DEPLOYER_MNEMONIC in .env instead of (or in addition to) WIF.

    let wallet: Wallet;

    const mnemonicPhrase = process.env.DEPLOYER_MNEMONIC;
    if (mnemonicPhrase) {
        console.log('Using mnemonic-based wallet derivation...');
        const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK);
        wallet = mnemonic.derive(0);
    } else {
        // Attempt WIF + quantum key approach
        const quantumPrivateKeyHex = process.env.DEPLOYER_QUANTUM_KEY;
        if (!quantumPrivateKeyHex) {
            console.error('ERROR: For WIF-based wallets, you also need DEPLOYER_QUANTUM_KEY in .env');
            console.error('  Alternatively, set DEPLOYER_MNEMONIC to use mnemonic derivation.');
            console.error('  Mnemonic derivation automatically handles both classical and quantum keys.');
            process.exit(1);
        }
        wallet = Wallet.fromWif(DEPLOYER_WIF, quantumPrivateKeyHex, NETWORK);
    }

    console.log(`Deployer address (P2TR): ${wallet.p2tr}`);
    console.log(`Deployer OPNet address:  ${wallet.address.toHex()}`);

    // -----------------------------------------------------------------------
    // 4. Set up providers
    // -----------------------------------------------------------------------
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // -----------------------------------------------------------------------
    // 5. Fetch UTXOs
    // -----------------------------------------------------------------------
    console.log('\nFetching UTXOs...');
    const utxos: UTXO[] = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: MIN_UTXO_AMOUNT,
        requestedAmount: REQUESTED_AMOUNT,
    });

    if (utxos.length === 0) {
        console.error('ERROR: No UTXOs found for the deployer address.');
        console.error(`  Send at least ${Number(REQUESTED_AMOUNT) / 1e8} BTC to: ${wallet.p2tr}`);
        process.exit(1);
    }

    const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0n);
    console.log(`Found ${utxos.length} UTXO(s), total: ${totalBalance} sats (${Number(totalBalance) / 1e8} BTC)`);

    // -----------------------------------------------------------------------
    // 6. Fetch epoch challenge
    // -----------------------------------------------------------------------
    console.log('\nFetching epoch challenge...');
    const challenge = await jsonRpcProvider.getChallenge();
    console.log(`Challenge obtained (difficulty: ${challenge.difficulty})`);

    // -----------------------------------------------------------------------
    // 7. Build and sign deployment transaction
    // -----------------------------------------------------------------------
    console.log('\nBuilding deployment transaction...');
    const factory = new TransactionFactory();

    // TODO: The signDeployment API may have additional optional parameters.
    // Verify these parameters match the current @btc-vision/transaction version.
    const result = await factory.signDeployment({
        // Signer configuration
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: NETWORK,

        // Deployment details
        from: wallet.p2tr,
        bytecode: bytecode,
        utxos: utxos,
        challenge: challenge,

        // Fee configuration -- MUST be high enough for large WASM
        feeRate: FEE_RATE,
        priorityFee: PRIORITY_FEE,
        gasSatFee: GAS_SAT_FEE,
    });

    console.log('\nDeployment transaction built successfully!');
    console.log(`  Contract address: ${result.contractAddress}`);
    console.log(`  Contract pubkey:  ${result.contractPubKey}`);
    console.log(`  Funding TX size:  ${result.transaction[0].length / 2} bytes`);
    console.log(`  Deploy TX size:   ${result.transaction[1].length / 2} bytes`);
    console.log(`  Remaining UTXOs:  ${result.utxos.length}`);

    // -----------------------------------------------------------------------
    // 8. Broadcast transactions
    // -----------------------------------------------------------------------
    banner('Broadcasting Transactions');

    // Step 1: Broadcast the funding transaction
    console.log('Broadcasting funding transaction...');
    const fundingResult = await limitedProvider.broadcastTransaction(
        result.transaction[0],
        false, // not a PSBT
    );

    if (!fundingResult || !fundingResult.success) {
        console.error('ERROR: Funding transaction broadcast failed!');
        if (fundingResult?.error) {
            console.error(`  Error: ${fundingResult.error}`);
        }
        // Check for revert data
        if (fundingResult && 'result' in fundingResult) {
            const raw = (fundingResult as Record<string, unknown>).result;
            if (typeof raw === 'string') {
                console.error(`  Revert: ${decodeRevert(raw)}`);
            }
        }
        process.exit(1);
    }
    console.log(`  Funding TX broadcast OK: ${fundingResult.result}`);

    // Brief pause to let the funding TX propagate
    console.log('  Waiting 3 seconds for propagation...');
    await new Promise((r) => setTimeout(r, 3000));

    // Step 2: Broadcast the deployment transaction
    console.log('Broadcasting deployment transaction...');
    const deployResult = await limitedProvider.broadcastTransaction(
        result.transaction[1],
        false, // not a PSBT
    );

    if (!deployResult || !deployResult.success) {
        console.error('ERROR: Deployment transaction broadcast failed!');
        if (deployResult?.error) {
            console.error(`  Error: ${deployResult.error}`);
        }
        if (deployResult && 'result' in deployResult) {
            const raw = (deployResult as Record<string, unknown>).result;
            if (typeof raw === 'string') {
                console.error(`  Revert: ${decodeRevert(raw)}`);
            }
        }
        process.exit(1);
    }
    console.log(`  Deployment TX broadcast OK: ${deployResult.result}`);

    // -----------------------------------------------------------------------
    // 9. Success output
    // -----------------------------------------------------------------------
    banner('DEPLOYMENT SUCCESSFUL');

    console.log(`  Contract Address: ${result.contractAddress}`);
    console.log(`  Contract PubKey:  ${result.contractPubKey}`);
    console.log('');

    // Update .env with the new contract address
    const envPath = resolve(import.meta.dirname ?? '.', '.env');
    if (existsSync(envPath)) {
        let envContent = readFileSync(envPath, 'utf-8');
        envContent = envContent.replace(
            /BAMPL_CONTRACT_ADDRESS=.*/,
            `BAMPL_CONTRACT_ADDRESS=${result.contractAddress}`,
        );
        writeFileSync(envPath, envContent);
        console.log('  Updated .env with the new BAMPL_CONTRACT_ADDRESS');
    }

    console.log('\n  NEXT STEPS:');
    console.log('  -----------');
    console.log(`  1. Copy the contract address to your frontend config:`);
    console.log(`     ${result.contractAddress}`);
    console.log('');
    console.log('  2. Run the demo script:');
    console.log('     npx tsx demo.ts');
    console.log('');
    console.log('  3. Create a liquidity pool:');
    console.log('     npx tsx create-pool.ts');
    console.log('');

    // Done
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
    console.error('\nFATAL ERROR during deployment:\n');
    console.error(err);

    // Try to decode revert if present
    if (err && typeof err === 'object' && 'revert' in err) {
        const revertMsg = (err as { revert: string }).revert;
        console.error(`\nRevert message: ${decodeRevert(revertMsg)}`);
    }

    process.exit(1);
});
