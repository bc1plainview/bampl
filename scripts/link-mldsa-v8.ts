/**
 * Link ML-DSA key via the opnet SDK's sendTransaction flow.
 * Uses RC packages with networks.opnetTestnet per opnet-bob guidelines.
 */
import 'dotenv/config';
import { OPNetLimitedProvider, Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

// Known OP20 contracts on testnet
const TARGET_CONTRACTS = [
    'opt1sqrlh60uk97lm44y9svrjcrdcrl950egdsgepx9la',
    'opt1sqqlnq2fg3lfcpdfrz25mmwkvvnvm2yca0vnw7use',
];

async function main() {
    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) {
        console.error('Set DEPLOYER_MNEMONIC in .env');
        process.exit(1);
    }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log('Linking ML-DSA key via contract interaction...');
    console.log(`Deployer: ${wallet.p2tr}`);
    console.log(`Address hex: ${wallet.address.toHex()}`);

    // Check current ML-DSA status
    console.log('\nChecking current ML-DSA key status...');
    try {
        const keyInfo = await provider.getPublicKeysInfo([wallet.p2tr]);
        const info = keyInfo?.[0] || keyInfo;
        console.log('  ML-DSA linked:', !!(info as any)?.mldsaHashedPublicKey);
        if ((info as any)?.mldsaHashedPublicKey) {
            console.log('  ML-DSA key is already linked! Skipping.');
            return;
        }
    } catch (e: any) {
        console.log('  Could not check key info:', e.message?.slice(0, 80));
    }

    // Fetch UTXOs
    console.log('\nFetching UTXOs...');
    const utxos = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 100_000n,
    });
    if (!utxos?.length) {
        console.error('No UTXOs found!');
        process.exit(1);
    }
    const total = utxos.reduce((s: bigint, u: any) => s + BigInt(u.value), 0n);
    console.log(`UTXOs: ${utxos.length}, total: ${total} sats`);

    // Fetch challenge
    console.log('Fetching challenge...');
    const challenge = await provider.getChallenge();
    console.log(`Challenge epoch: ${challenge.epochNumber}`);

    for (const contractAddr of TARGET_CONTRACTS) {
        console.log(`\n--- Trying ${contractAddr} ---`);

        try {
            const contract = getContract(contractAddr, OP_20_ABI, provider, NETWORK);
            contract.setSender(wallet.address);

            // Simulate a no-op write function
            let callResult: any = null;
            try {
                callResult = await (contract as any).increaseAllowance(wallet.address, 0n);
                if (callResult?.calldata) console.log('  increaseAllowance simulation OK');
            } catch (e: any) {
                console.log(`  increaseAllowance: ${e.message?.slice(0, 80)}`);
            }

            if (!callResult?.calldata) {
                try {
                    callResult = await (contract as any).transfer(wallet.address, 0n);
                    if (callResult?.calldata) console.log('  transfer(self, 0) simulation OK');
                } catch (e: any) {
                    console.log(`  transfer: ${e.message?.slice(0, 80)}`);
                }
            }

            if (!callResult?.calldata) {
                console.log('  No valid write method, skipping');
                continue;
            }

            // Send transaction - SDK defaults linkMLDSAPublicKeyToAddress: true
            console.log('  Sending transaction...');
            const txResult = await callResult.sendTransaction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                from: wallet.address,
                refundTo: wallet.p2tr,
                feeRate: 100,
                priorityFee: 100_000n,
                maximumAllowedSatToSpend: 500_000n,
                network: NETWORK,
                utxos: utxos,
                challenge: challenge,
            });

            if (txResult?.transactionId) {
                console.log('\n  ML-DSA KEY LINKING BROADCAST!');
                console.log(`  TX: ${txResult.transactionId}`);
                console.log(`  Peers: ${txResult.peerAcknowledgements}`);
                console.log('  Wait for block confirmation (~10 min), then deploy BAMPL.');
                return;
            }

            // Check for raw TX fields if sendPresignedTransaction ran internally
            console.log('  Result keys:', Object.keys(txResult || {}));

            if (txResult?.fundingTransaction || txResult?.fundingTransactionRaw) {
                const funding = txResult.fundingTransactionRaw || txResult.fundingTransaction;
                const fundRes = await limitedProvider.broadcastTransaction(funding, false);
                console.log(`  Funding: ${fundRes?.success ? 'OK' : 'FAILED'} ${fundRes?.result || fundRes?.error || ''}`);
                if (!fundRes?.success) continue;
                await new Promise(r => setTimeout(r, 3000));
            }

            if (txResult?.interactionTransaction || txResult?.interactionTransactionRaw) {
                const interaction = txResult.interactionTransactionRaw || txResult.interactionTransaction;
                const intRes = await limitedProvider.broadcastTransaction(interaction, false);
                console.log(`  Interaction: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);
                if (intRes?.success) {
                    console.log('\n  ML-DSA KEY LINKING BROADCAST!');
                    console.log(`  TX: ${intRes.result}`);
                    return;
                }
            }
        } catch (e: any) {
            console.error(`  Error: ${e.message?.slice(0, 300)}`);
        }
    }

    console.log('\nAll attempts exhausted.');
}

main().catch((err) => {
    console.error('FATAL:', err.message?.slice(0, 500));
    process.exit(1);
});
