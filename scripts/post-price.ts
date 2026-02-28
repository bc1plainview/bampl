/**
 * Post an oracle price to the BAMPL contract.
 * Usage: npx tsx post-price.ts [price_multiplier]
 *
 * Examples:
 *   npx tsx post-price.ts        # posts 1.0 (at peg)
 *   npx tsx post-price.ts 1.5    # posts 1.5 MOTO (expansion)
 *   npx tsx post-price.ts 0.7    # posts 0.7 MOTO (contraction)
 */
import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT_ADDRESS = process.env.BAMPL_CONTRACT_ADDRESS || 'opt1sqra07v3clulmps9krt57rngcthad2wxlyqqxrhzl';
const DECIMALS = 8;

async function main() {
    const multiplier = parseFloat(process.argv[2] || '1.0');
    const priceRaw = BigInt(Math.round(multiplier * 10 ** DECIMALS));

    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) {
        console.error('Set DEPLOYER_MNEMONIC in .env');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);

    console.log(`Posting oracle price: ${multiplier} MOTO (raw: ${priceRaw})`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const contract = getContract(CONTRACT_ADDRESS, BAMPLTokenAbi, provider, NETWORK);
    contract.setSender(wallet.address);

    // Simulate
    console.log('Simulating postPrice...');
    const simResult = await (contract as any).postPrice(priceRaw);

    if (!simResult || !simResult.calldata) {
        console.error('Simulation failed:', simResult);
        process.exit(1);
    }
    console.log('Simulation OK');

    // Fetch UTXOs
    const utxos = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 100_000n,
    });

    if (utxos.length === 0) {
        console.error('No UTXOs available');
        process.exit(1);
    }

    const challenge = await provider.getChallenge();

    // Send
    console.log('Sending transaction...');
    const txResult = await (contract as any).sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        from: wallet.p2tr,
        utxos,
        challenge,
        feeRate: 10,
        priorityFee: 10_000n,
        gasSatFee: 50_000n,
    });

    if (txResult && txResult.transaction) {
        for (let i = 0; i < txResult.transaction.length; i++) {
            const res = await limitedProvider.broadcastTransaction(txResult.transaction[i], false);
            console.log(`TX ${i + 1}:`, res?.success ? 'OK' : 'FAILED', res?.result || res?.error || '');
            if (i < txResult.transaction.length - 1) {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
    }

    console.log(`\nOracle price posted: ${multiplier} MOTO`);
    wallet.zeroize();
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
