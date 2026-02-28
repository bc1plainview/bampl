import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT_ADDRESS = process.env.BAMPL_CONTRACT_ADDRESS || 'opt1sqra07v3clulmps9krt57rngcthad2wxlyqqxrhzl';

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) {
        console.error('Set DEPLOYER_MNEMONIC in .env');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);

    console.log('Enabling demo mode on BAMPL contract...');
    console.log(`Contract: ${CONTRACT_ADDRESS}`);
    console.log(`Deployer: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);

    // Get contract instance with ABI
    const contract = getContract(CONTRACT_ADDRESS, BAMPLTokenAbi, provider, NETWORK);
    contract.setSender(wallet.address);

    // Simulate enableDemoMode call
    console.log('\nSimulating enableDemoMode...');
    const simResult = await (contract as any).enableDemoMode();
    console.log('Simulation OK:', !!simResult?.calldata);

    if (!simResult || !simResult.calldata) {
        console.error('Simulation failed:', simResult);
        process.exit(1);
    }

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

    console.log(`Found ${utxos.length} UTXO(s)`);

    // Get challenge
    const challenge = await provider.getChallenge();

    // Send transaction (backend: must specify signers)
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
            const broadcastResult = await limitedProvider.broadcastTransaction(txResult.transaction[i], false);
            console.log(`TX ${i + 1} broadcast:`, broadcastResult?.success ? 'OK' : 'FAILED', broadcastResult?.result || broadcastResult?.error || '');
            if (i < txResult.transaction.length - 1) {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
    }

    console.log('\nDemo mode enabled! Epoch length = 1 block, rebase lag = 2.');
    wallet.zeroize();
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
