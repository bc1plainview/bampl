import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const limitedProvider = new OPNetLimitedProvider(RPC_URL);

async function main() {
    // First, check available UTXOs (funding TX from previous debug run may have changed things)
    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    console.log(`UTXOs: ${utxos.length}`);
    for (const u of utxos) {
        console.log(`  ${u.transactionId}:${u.outputIndex} = ${u.value} sats`);
    }

    if (!utxos.length) {
        console.log('No UTXOs - previous funding TX may have consumed them. Wait for next block.');
        return;
    }

    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    const sim = await (c as ReturnType<typeof getContract>).postPrice(130_000_000n);
    console.log('Sim OK');

    const challenge = await provider.getChallenge();

    // Sign
    const signedTx = await sim.signTransaction({
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

    // Print interaction TX hex (first 200 chars)
    const rawHex = signedTx.interactionTransactionRaw;
    console.log(`\nInteraction TX (${rawHex.length} chars / ${rawHex.length / 2} bytes):`);
    console.log(`  First 200: ${rawHex.slice(0, 200)}`);
    console.log(`  Last 100: ${rawHex.slice(-100)}`);

    // Try broadcastTransaction with isPSBT=true to see if that helps
    console.log('\nBroadcasting funding...');
    const f = await limitedProvider.broadcastTransaction(signedTx.fundingTransactionRaw, false);
    console.log('Funding:', JSON.stringify(f));
    if (!f?.success) return;

    await new Promise(r => setTimeout(r, 3000));

    console.log('\nBroadcasting interaction (isPSBT=false)...');
    const i1 = await limitedProvider.broadcastTransaction(rawHex, false);
    console.log('Result:', JSON.stringify(i1));

    if (!i1?.success) {
        // Try with isPSBT=true
        console.log('\nRetrying with isPSBT=true...');
        const i2 = await limitedProvider.broadcastTransaction(rawHex, true);
        console.log('Result:', JSON.stringify(i2));
    }
}

main().catch(err => console.error('Fatal:', (err as Error).message?.slice(0, 500)));
