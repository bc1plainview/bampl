/**
 * Links ML-DSA key by sending an interaction TX to an existing contract.
 *
 * The key insight: createBTCTransfer() (FundingTransaction) does NOT support
 * ML-DSA features. Only InteractionTransaction and DeploymentTransaction do.
 * And deployment TX can't link + deploy in the same TX (chicken-and-egg).
 *
 * Solution: interact with any existing contract with ML-DSA flags.
 * The interaction will process the ML-DSA link feature regardless of
 * whether the contract call itself succeeds or reverts.
 */
import 'dotenv/config';
import { TransactionFactory, OPNetLimitedProvider, Mnemonic, type UTXO } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

// We need ANY existing contract on testnet. Let's try a few known ones.
// WBTC/OP_20 token addresses - we'll try to find one that exists.
const KNOWN_CONTRACTS = [
    // MotoSwap Router (from opnet contract addresses)
    'opt1sqqnprz8g7hfpjxhqe0u7p8gq22xkkwepqmfwl0y',
    // NativeSwap Router
    'opt1sqqarxk6g5tpj0jv6rfypq4hntf6kylrkqpxsyyz',
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
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log('Linking ML-DSA key via contract interaction...');
    console.log(`Deployer: ${wallet.p2tr}`);

    // Get UTXOs
    const utxos: UTXO[] = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 200_000n,
    });
    if (utxos.length === 0) {
        console.error('No UTXOs found');
        process.exit(1);
    }
    console.log(`UTXOs: ${utxos.length}, total: ${utxos.reduce((s, u) => s + u.value, 0n)} sats`);

    // Get challenge
    const challenge = await jsonRpcProvider.getChallenge();
    console.log(`Challenge obtained (difficulty: ${challenge.difficulty})`);

    const factory = new TransactionFactory();

    // Try to build a simple interaction calldata - we'll use a minimal OP_20 name() call
    // Selector for name() is typically the first 4 bytes of keccak256("name()")
    // In OPNet's ABI encoding, we can try using the opnet SDK to generate calldata
    // But for simplicity, let's try a raw 4-byte selector approach

    // Actually, let's use the opnet SDK to get proper calldata from a known contract
    // We'll create a minimal OP_20 ABI just for name()
    const minimalAbi = [
        {
            name: 'name',
            inputs: [],
            outputs: [{ name: 'name', type: 'String' }],
            type: 'Function',
        },
    ];

    // Try each known contract until one works
    for (const contractAddr of KNOWN_CONTRACTS) {
        console.log(`\nTrying contract: ${contractAddr}`);
        try {
            // First check if this contract exists
            const code = await jsonRpcProvider.getCode(contractAddr);
            if (!code) {
                console.log('  Contract not found, skipping...');
                continue;
            }
            console.log('  Contract found!');

            // Use getContract to generate calldata via simulation
            const contract = getContract(contractAddr, minimalAbi as any, jsonRpcProvider, NETWORK);
            contract.setSender(wallet.address);

            let calldata: Uint8Array;
            try {
                const sim = await (contract as any).name();
                if (sim?.calldata) {
                    calldata = sim.calldata;
                    console.log(`  Simulation OK, calldata: ${calldata.length} bytes`);
                } else {
                    console.log('  Simulation returned no calldata, trying raw approach...');
                    continue;
                }
            } catch (e: any) {
                console.log(`  Simulation error: ${e.message?.slice(0, 100)}`);
                console.log('  Trying raw interaction...');
                // Use a minimal calldata (empty or just selector)
                calldata = new Uint8Array([0, 0, 0, 0]);
            }

            // Now use signInteraction directly with ML-DSA flags
            console.log('  Building interaction TX with ML-DSA link flags...');
            const result = await factory.signInteraction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                network: NETWORK,
                from: wallet.p2tr,
                to: contractAddr,
                calldata,
                utxos,
                challenge,
                feeRate: 10,
                priorityFee: 10_000n,
                gasSatFee: 50_000n,
                revealMLDSAPublicKey: true,
                linkMLDSAPublicKeyToAddress: true,
            });

            console.log('  Interaction TX built!');

            // Broadcast funding TX
            const fundingRes = await limitedProvider.broadcastTransaction(result.fundingTransaction, false);
            if (!fundingRes?.success) {
                console.error('  Funding TX failed:', fundingRes?.error);
                continue;
            }
            console.log(`  Funding TX: ${fundingRes.result}`);

            // Wait for propagation
            await new Promise((r) => setTimeout(r, 3000));

            // Broadcast interaction TX
            const interactionRes = await limitedProvider.broadcastTransaction(result.interactionTransaction, false);
            console.log(`  Interaction TX: ${interactionRes?.success ? 'OK' : 'FAILED'} ${interactionRes?.result || interactionRes?.error || ''}`);

            if (interactionRes?.success) {
                console.log('\n  ML-DSA KEY LINKING TX BROADCAST!');
                console.log('  Wait for block confirmation (~10 min) then deploy.');
                console.log(`  Interaction TX: ${interactionRes.result}`);
                wallet.zeroize();
                return;
            }
        } catch (e: any) {
            console.log(`  Error: ${e.message?.slice(0, 200)}`);
        }
    }

    // If no known contract worked, try with raw calldata to our previous (reverted) contract
    console.log('\n\nFalling back: sending interaction to our reverted contract address...');
    const revertedContract = 'opt1sqp8as2epqxqj7m33naaqeqtkh3mh8ck8wskn5fg0';

    try {
        const result = await factory.signInteraction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network: NETWORK,
            from: wallet.p2tr,
            to: revertedContract,
            calldata: new Uint8Array([0, 0, 0, 0]), // dummy calldata
            utxos,
            challenge,
            feeRate: 10,
            priorityFee: 10_000n,
            gasSatFee: 50_000n,
            revealMLDSAPublicKey: true,
            linkMLDSAPublicKeyToAddress: true,
        });

        const fundingRes = await limitedProvider.broadcastTransaction(result.fundingTransaction, false);
        console.log(`  Funding TX: ${fundingRes?.success ? 'OK' : 'FAILED'} ${fundingRes?.result || fundingRes?.error || ''}`);

        if (fundingRes?.success) {
            await new Promise((r) => setTimeout(r, 3000));
            const intRes = await limitedProvider.broadcastTransaction(result.interactionTransaction, false);
            console.log(`  Interaction TX: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);
        }
    } catch (e: any) {
        console.log(`  Error: ${e.message?.slice(0, 200)}`);
    }

    wallet.zeroize();
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
