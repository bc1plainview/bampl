/**
 * Link ML-DSA key via signInteraction with a real testnet OP20 contract.
 * Uses stable SDK (v1.7.31) with manual UTXO fetching using opt1 addresses.
 */
import 'dotenv/config';
import { OPNetLimitedProvider, Mnemonic, TransactionFactory } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';
import { bech32m } from '@scure/base';

const NETWORK = networks.testnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

// Convert tb1... P2TR to opt1... for OPNet RPC queries
function toOptAddress(tb1Addr: string): string {
    const decoded = bech32m.decode(tb1Addr);
    return bech32m.encode('opt', decoded.words);
}

// Known OP20 contracts on testnet (from block scanning)
const TARGET_CONTRACTS = [
    'opt1sqqlnq2fg3lfcpdfrz25mmwkvvnvm2yca0vnw7use',
    'opt1sqrlh60uk97lm44y9svrjcrdcrl950egdsgepx9la',
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
    const provider = new JSONRpcProvider(RPC_URL, NETWORK);
    const factory = new TransactionFactory();

    const optAddr = toOptAddress(wallet.p2tr);
    console.log('Linking ML-DSA key via contract interaction...');
    console.log(`Deployer (tb1): ${wallet.p2tr}`);
    console.log(`Deployer (opt): ${optAddr}`);
    console.log(`Address hex: ${wallet.address.toHex()}`);

    // Fetch UTXOs using opt1 address
    const utxos = await limitedProvider.fetchUTXO({
        address: optAddr,
        minAmount: 100_000n,
    });
    if (!utxos?.length) {
        console.error('No UTXOs found!');
        process.exit(1);
    }
    console.log(`UTXOs: ${utxos.length}, total: ${utxos.reduce((s: bigint, u: any) => s + BigInt(u.value), 0n)} sats`);

    for (const contractAddr of TARGET_CONTRACTS) {
        console.log(`\n--- Trying ${contractAddr} ---`);

        try {
            const contract = getContract(contractAddr, OP_20_ABI, provider, NETWORK);
            contract.setSender(wallet.address);

            // Try increaseAllowance(self, 0) - a no-op write
            let callResult: any = null;
            try {
                callResult = await (contract as any).increaseAllowance(wallet.address, 0n);
                if (callResult?.calldata) {
                    console.log('  increaseAllowance simulation OK');
                }
            } catch (e: any) {
                console.log(`  increaseAllowance: ${e.message?.slice(0, 80)}`);
            }

            if (!callResult?.calldata) {
                try {
                    callResult = await (contract as any).transfer(wallet.address, 0n);
                    if (callResult?.calldata) {
                        console.log('  transfer(self, 0) simulation OK');
                    }
                } catch (e: any) {
                    console.log(`  transfer: ${e.message?.slice(0, 80)}`);
                }
            }

            if (!callResult?.calldata) {
                console.log('  No valid write method found, skipping');
                continue;
            }

            // Get the contract's internal address for signInteraction
            const contractInternalAddr = (contract as any).address || (contract as any).contractAddress;
            console.log('  Contract internal address:', contractInternalAddr?.toString?.() || contractInternalAddr);

            // Get the 'to' address (P2TR of contract)
            const contractP2tr = (contract as any).p2trAddress || (contract as any).to;
            console.log('  Contract P2TR/to:', contractP2tr);

            // Build the interaction TX using TransactionFactory.signInteraction
            console.log('  Building interaction TX via TransactionFactory...');

            const interactionParams = {
                from: wallet.address,
                to: contractP2tr || contractAddr,
                utxos: utxos,
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                network: NETWORK,
                feeRate: 10,
                priorityFee: 10_000n,
                calldata: callResult.calldata,
                refundTo: optAddr,
                // ML-DSA linking
                linkMLDSAPublicKeyToAddress: true,
                revealMLDSAPublicKey: true,
                // Contract address (hex without 0x)
                contract: contractInternalAddr?.toHex?.()?.replace('0x', '') || '',
            };

            console.log('  Params: contract=', interactionParams.contract?.slice(0, 20) + '...');
            console.log('  Params: to=', interactionParams.to);

            const txResult = await factory.signInteraction(interactionParams as any);

            if (!txResult) {
                console.log('  signInteraction returned null');
                continue;
            }

            console.log('  Transaction built!');

            // Broadcast funding TX
            if (txResult.fundingTransaction) {
                const fundRes = await limitedProvider.broadcastTransaction(txResult.fundingTransaction, false);
                console.log(`  Funding TX: ${fundRes?.success ? 'OK' : 'FAILED'} ${fundRes?.result || fundRes?.error || ''}`);
                if (!fundRes?.success) continue;
                await new Promise((r) => setTimeout(r, 3000));
            }

            // Broadcast interaction TX
            if (txResult.interactionTransaction) {
                const intRes = await limitedProvider.broadcastTransaction(txResult.interactionTransaction, false);
                console.log(`  Interaction TX: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);

                if (intRes?.success) {
                    console.log('\n  ML-DSA KEY LINKING INTERACTION BROADCAST!');
                    console.log(`  TX: ${intRes.result}`);
                    console.log('  Wait for block confirmation (~10 min), then deploy BAMPL.');
                    return;
                } else {
                    // Try to decode revert reason
                    const raw = (intRes as any)?.result;
                    if (typeof raw === 'string') {
                        try {
                            console.log(`  Revert: ${Buffer.from(raw, 'base64').toString('utf8')}`);
                        } catch { /* */ }
                    }
                }
            }

            // Alternative: check for 'transaction' array format
            if ((txResult as any).transaction) {
                for (let i = 0; i < (txResult as any).transaction.length; i++) {
                    const res = await limitedProvider.broadcastTransaction((txResult as any).transaction[i], false);
                    console.log(`  TX ${i + 1}: ${res?.success ? 'OK' : 'FAILED'} ${res?.result || res?.error || ''}`);
                    if (i < (txResult as any).transaction.length - 1) await new Promise((r) => setTimeout(r, 2000));
                }
                console.log('\n  ML-DSA KEY LINKING INTERACTION BROADCAST!');
                return;
            }
        } catch (e: any) {
            console.error(`  Error: ${e.message?.slice(0, 300)}`);
            if (e.stack) console.error(`  Stack: ${e.stack.split('\n').slice(0, 3).join('\n')}`);
        }
    }

    console.log('\nAll attempts exhausted.');
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
