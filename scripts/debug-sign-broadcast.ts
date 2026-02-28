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
    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    console.log('Simulating rebase...');
    const sim = await (c as ReturnType<typeof getContract>).rebase();
    if (!sim?.calldata) {
        console.log('Simulation failed');
        return;
    }
    console.log('Simulation OK');

    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    console.log(`UTXOs: ${utxos.length}, value: ${utxos.reduce((s: bigint, u: { value: bigint }) => s + u.value, 0n)}`);

    const challenge = await provider.getChallenge();
    console.log(`Challenge epoch: ${challenge.epochNumber}`);

    // Sign without broadcasting
    console.log('\nSigning...');
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

    console.log('Signed TX keys:', Object.keys(signed));
    console.log('Funding TX length:', signed.fundingTransactionRaw?.length);
    console.log('Interaction TX length:', signed.interactionTransactionRaw?.length);

    // Broadcast funding first
    console.log('\nBroadcasting funding TX...');
    const fundResult = await limitedProvider.broadcastTransaction(signed.fundingTransactionRaw, false);
    console.log('Funding result:', JSON.stringify(fundResult));

    if (!fundResult?.success) {
        console.log('Funding failed, stopping');
        return;
    }

    // Wait a bit
    await new Promise(r => setTimeout(r, 2000));

    // Try broadcasting interaction TX
    console.log('\nBroadcasting interaction TX (isPSBT=false)...');
    try {
        const intResult = await limitedProvider.broadcastTransaction(signed.interactionTransactionRaw, false);
        console.log('Interaction result:', JSON.stringify(intResult));
    } catch (e: unknown) {
        console.error('Interaction error:', (e as Error).message?.slice(0, 300));
    }

    // Also try the sendPresignedTransaction method
    console.log('\nTrying sendPresignedTransaction...');
    try {
        const presigned = await provider.sendPresignedTransaction({
            fundingTransactionRaw: signed.fundingTransactionRaw,
            interactionTransactionRaw: signed.interactionTransactionRaw,
        });
        console.log('Presigned result:', JSON.stringify(presigned, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    } catch (e: unknown) {
        console.error('Presigned error:', (e as Error).message?.slice(0, 300));
    }
}

main().catch(err => console.error('Fatal:', (err as Error).message?.slice(0, 500)));
