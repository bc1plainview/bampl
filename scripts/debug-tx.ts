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
    console.log('Contract:', CONTRACT);
    console.log('Wallet:', wallet.p2tr);

    // Fetch UTXOs
    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    console.log(`\nUTXOs: ${utxos.length}`);
    for (const u of utxos) {
        console.log(`  txid: ${u.transactionId} vout: ${u.outputIndex} value: ${u.value}`);
    }

    // Fetch challenge
    const challenge = await provider.getChallenge();
    console.log(`\nChallenge epoch: ${challenge.epochNumber}, difficulty: ${challenge.difficulty}`);

    // Simulate
    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    console.log('\nSimulating postPrice(1.30)...');
    const sim = await (c as ReturnType<typeof getContract>).postPrice(130_000_000n);
    console.log('  calldata:', !!sim.calldata);
    console.log('  estimatedGas:', sim.estimatedGas);

    // Try sending with detailed error catching
    console.log('\nSending transaction...');
    try {
        const txResult = await sim.sendTransaction({
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
        console.log('Result:', JSON.stringify(txResult, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e: unknown) {
        const err = e as Error & {
            code?: string;
            data?: unknown;
            response?: unknown;
            cause?: unknown;
        };
        console.error('Error message:', err.message);
        console.error('Error code:', err.code);
        console.error('Error data:', JSON.stringify(err.data));
        console.error('Error cause:', err.cause);
        console.error('Stack:', err.stack?.slice(0, 500));
    }
}

main().catch(console.error);
