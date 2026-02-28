/**
 * Debug: sign rebase TX, inspect the raw hex, and broadcast step-by-step.
 */
import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const limitedProvider = new OPNetLimitedProvider(RPC_URL);

async function main() {
    console.log('=== DEBUG REBASE V2 ===');
    console.log('Wallet:', wallet.p2tr);
    console.log('Contract:', CONTRACT);

    // 1. Get contract and simulate
    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    console.log('\n--- Simulating rebase ---');
    const sim = await (c as ReturnType<typeof getContract>).rebase();
    if (!sim?.calldata) {
        console.log('Simulation failed');
        return;
    }
    console.log('Simulation OK, calldata length:', sim.calldata.length);

    // 2. Fetch UTXOs
    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    console.log(`\nUTXOs: ${utxos.length}`);
    for (const u of utxos) {
        console.log(`  - ${u.transactionId}:${u.outputIndex} = ${u.value} sats`);
    }

    // 3. Get challenge
    const challenge = await provider.getChallenge();
    console.log(`\nChallenge epoch: ${challenge.epochNumber}`);

    // 4. Sign (don't broadcast yet)
    console.log('\n--- Signing ---');
    const signed = await sim.signTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        from: wallet.address,
        refundTo: wallet.p2tr,
        utxos,
        challenge,
        feeRate: 50,
        priorityFee: 50_000n,
        maximumAllowedSatToSpend: 500_000n,
        network: NETWORK,
    });

    console.log('Signed TX object keys:', Object.keys(signed));
    console.log('Funding TX hex length:', signed.fundingTransactionRaw?.length);
    console.log('Interaction TX hex length:', signed.interactionTransactionRaw?.length);

    // Inspect first 80 chars of each
    if (signed.fundingTransactionRaw) {
        console.log('\nFunding TX hex (first 80):', signed.fundingTransactionRaw.slice(0, 80));
    }
    if (signed.interactionTransactionRaw) {
        console.log('Interaction TX hex (first 80):', signed.interactionTransactionRaw.slice(0, 80));
    }

    // 5. Broadcast funding first via limitedProvider
    console.log('\n--- Broadcasting funding TX ---');
    try {
        const fundResult = await limitedProvider.broadcastTransaction(signed.fundingTransactionRaw, false);
        console.log('Funding result:', JSON.stringify(fundResult));
    } catch (e: unknown) {
        console.error('Funding error:', (e as Error).message?.slice(0, 300));
        return;
    }

    // 6. Now try interaction TX via provider.sendRawTransaction
    console.log('\n--- Broadcasting interaction TX via sendRawTransaction ---');
    try {
        const intResult = await provider.sendRawTransaction(signed.interactionTransactionRaw, false);
        console.log('Interaction via sendRawTransaction:', JSON.stringify(intResult, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    } catch (e: unknown) {
        console.error('sendRawTransaction error:', (e as Error).message?.slice(0, 300));
    }

    // 7. Also try via limitedProvider.broadcastTransaction
    console.log('\n--- Broadcasting interaction TX via broadcastTransaction ---');
    try {
        const intResult2 = await limitedProvider.broadcastTransaction(signed.interactionTransactionRaw, false);
        console.log('Interaction via broadcastTransaction:', JSON.stringify(intResult2));
    } catch (e: unknown) {
        console.error('broadcastTransaction error:', (e as Error).message?.slice(0, 300));
    }

    // 8. Try the presigned method
    console.log('\n--- Trying sendPresignedTransaction ---');
    try {
        const presignedResult = await provider.sendPresignedTransaction({
            fundingTransactionRaw: signed.fundingTransactionRaw,
            interactionTransactionRaw: signed.interactionTransactionRaw,
        });
        console.log('Presigned result:', JSON.stringify(presignedResult, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    } catch (e: unknown) {
        console.error('Presigned error:', (e as Error).message?.slice(0, 300));
    }
}

main().catch(err => console.error('Fatal:', (err as Error).message?.slice(0, 500)));
