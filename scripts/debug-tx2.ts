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
    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    const sim = await (c as ReturnType<typeof getContract>).postPrice(130_000_000n);
    console.log('Simulation OK, calldata:', !!sim.calldata);

    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    const challenge = await provider.getChallenge();

    // Sign the transaction
    console.log('\nSigning transaction...');
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

    console.log('Signed TX keys:', Object.keys(signedTx));
    console.log('Has fundingTransactionRaw:', !!signedTx.fundingTransactionRaw);
    console.log('Has interactionTransactionRaw:', !!signedTx.interactionTransactionRaw);

    if (signedTx.fundingTransactionRaw) {
        console.log('Funding TX length:', signedTx.fundingTransactionRaw.length);
    }
    if (signedTx.interactionTransactionRaw) {
        console.log('Interaction TX length:', signedTx.interactionTransactionRaw.length);
    }

    // Broadcast funding TX
    if (signedTx.fundingTransactionRaw) {
        console.log('\nBroadcasting funding TX...');
        const fundResult = await limitedProvider.broadcastTransaction(signedTx.fundingTransactionRaw, false);
        console.log('Funding result:', JSON.stringify(fundResult));
        if (!fundResult?.success) {
            console.error('Funding TX failed!');
            return;
        }
        console.log('Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
    }

    // Broadcast interaction TX
    console.log('\nBroadcasting interaction TX...');
    const intResult = await limitedProvider.broadcastTransaction(signedTx.interactionTransactionRaw, false);
    console.log('Interaction result:', JSON.stringify(intResult));
}

main().catch(err => console.error('Fatal:', (err as Error).message?.slice(0, 500)));
