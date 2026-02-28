/**
 * Link ML-DSA key by interacting with a real existing contract on testnet.
 * Uses signInteraction directly with ML-DSA flags.
 */
import 'dotenv/config';
import { TransactionFactory, OPNetLimitedProvider, Mnemonic, type UTXO } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

// Active contract on testnet (from block explorer scan)
const TARGET_CONTRACT = 'opt1sqp974ylnw8l5pq5setwtdtlc7w4s5405cchhpfwn';

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

    console.log('Linking ML-DSA key via interaction with existing contract...');
    console.log(`Deployer: ${wallet.p2tr}`);
    console.log(`Target contract: ${TARGET_CONTRACT}`);

    // Step 1: Get contract interface and simulate a call to get valid calldata
    console.log('\n1. Simulating contract call (approve 0)...');
    const contract = getContract(TARGET_CONTRACT, OP_20_ABI, jsonRpcProvider, NETWORK);
    contract.setSender(wallet.address);

    let calldata: Uint8Array;
    let contractHex: string;

    try {
        // Try approve(self, 0) - a no-op that shouldn't revert
        const sim = await (contract as any).approve(wallet.address, 0n);
        if (!sim?.calldata) {
            console.error('Simulation returned no calldata');
            process.exit(1);
        }
        calldata = sim.calldata;
        console.log(`   Calldata: ${calldata.length} bytes`);

        // Get the contract's hex address from the contract object
        contractHex = (contract as any).address?.toHex?.() || '';
        if (!contractHex) {
            // Try alternate access
            contractHex = (contract as any)._address?.toHex?.() || '';
        }
        console.log(`   Contract hex: ${contractHex || 'not found'}`);
    } catch (e: any) {
        console.error(`   Simulation error: ${e.message?.slice(0, 200)}`);
        process.exit(1);
    }

    if (!contractHex) {
        console.log('\n   Trying to get contract hex from public key info...');
        try {
            const info = await jsonRpcProvider.getPublicKeysInfoRaw(TARGET_CONTRACT);
            console.log('   Info:', JSON.stringify(info, null, 2));
            // Try to extract tweakedPubkey or similar
            const data = (info as any)[TARGET_CONTRACT];
            if (data) {
                contractHex = data.tweakedPubkey || data.mldsaHashedPublicKey || '';
                if (contractHex && !contractHex.startsWith('0x')) contractHex = '0x' + contractHex;
            }
        } catch (e: any) {
            console.log(`   Error: ${e.message?.slice(0, 200)}`);
        }
    }

    if (!contractHex) {
        console.error('Could not determine contract hex address. Exiting.');
        process.exit(1);
    }

    // Step 2: Build interaction TX with ML-DSA flags
    console.log('\n2. Building interaction TX with ML-DSA flags...');
    const utxos: UTXO[] = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 200_000n,
    });
    if (utxos.length === 0) {
        console.error('No UTXOs');
        process.exit(1);
    }
    console.log(`   UTXOs: ${utxos.length}`);

    const challenge = await jsonRpcProvider.getChallenge();
    const factory = new TransactionFactory();

    try {
        const result = await factory.signInteraction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network: NETWORK,
            from: wallet.p2tr,
            to: TARGET_CONTRACT,
            contract: contractHex,
            calldata,
            utxos,
            challenge,
            feeRate: 10,
            priorityFee: 10_000n,
            gasSatFee: 50_000n,
            revealMLDSAPublicKey: true,
            linkMLDSAPublicKeyToAddress: true,
        });

        console.log('   Interaction TX built!');

        // Step 3: Broadcast
        console.log('\n3. Broadcasting...');
        const fundingRes = await limitedProvider.broadcastTransaction(result.fundingTransaction, false);
        if (!fundingRes?.success) {
            console.error('   Funding TX failed:', fundingRes?.error);
            process.exit(1);
        }
        console.log(`   Funding TX: ${fundingRes.result}`);

        await new Promise((r) => setTimeout(r, 3000));

        const intRes = await limitedProvider.broadcastTransaction(result.interactionTransaction, false);
        console.log(`   Interaction TX: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);

        if (intRes && 'result' in intRes) {
            const raw = (intRes as Record<string, unknown>).result;
            if (typeof raw === 'string' && !intRes.success) {
                try {
                    console.log(`   Revert: ${Buffer.from(raw, 'base64').toString('utf8')}`);
                } catch { /* ignore */ }
            }
        }

        if (intRes?.success) {
            console.log('\n   ML-DSA KEY LINKING TX BROADCAST!');
            console.log(`   TX: ${intRes.result}`);
            console.log('   Wait ~10 min for block confirmation, then deploy.');
        }
    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }

    wallet.zeroize();
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
