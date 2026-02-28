/**
 * Link ML-DSA key by interacting with an existing contract.
 * Tries multiple approaches to find valid calldata.
 */
import 'dotenv/config';
import { TransactionFactory, OPNetLimitedProvider, Mnemonic, type UTXO } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

// Active contracts on testnet
const TARGET_CONTRACTS = [
    'opt1sqp974ylnw8l5pq5setwtdtlc7w4s5405cchhpfwn',
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
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log('Deployer:', wallet.p2tr);

    // Check what OP_20_ABI has
    console.log('\nOP_20_ABI methods:', (OP_20_ABI as any[])?.map((a: any) => a.name).join(', '));

    for (const contractAddr of TARGET_CONTRACTS) {
        console.log(`\n=== Trying ${contractAddr} ===`);

        // Get contract interface
        const contract = getContract(contractAddr, OP_20_ABI, provider, NETWORK);
        contract.setSender(wallet.address);

        // Try to get the contract's internal hex address
        let contractHex = '';
        const addressObj = (contract as any).address || (contract as any)._address;
        if (addressObj) {
            console.log('Address object type:', typeof addressObj);
            console.log('Address object:', JSON.stringify(addressObj, (_, v) => {
                if (v instanceof Uint8Array) return `Uint8Array(${v.length}): ${Buffer.from(v).toString('hex').slice(0, 40)}...`;
                if (typeof v === 'bigint') return v.toString();
                return v;
            }).slice(0, 300));
            if (typeof addressObj.toHex === 'function') {
                contractHex = addressObj.toHex();
            }
        }
        console.log('Contract hex:', contractHex || 'not found');

        // Also try getPublicKeysInfoRaw for the contract
        try {
            const info = await provider.getPublicKeysInfoRaw(contractAddr);
            const addrInfo = (info as any)[contractAddr];
            if (addrInfo) {
                console.log('Contract pubkey info:', JSON.stringify(addrInfo).slice(0, 300));
                if (!contractHex && addrInfo.tweakedPubkey) {
                    contractHex = '0x' + addrInfo.tweakedPubkey;
                }
            }
        } catch (e: any) {
            console.log('PubKey info error:', e.message?.slice(0, 100));
        }

        if (!contractHex) {
            console.log('  Could not get contract hex, skipping');
            continue;
        }

        // List available methods
        const proto = Object.getPrototypeOf(contract);
        const methods = Object.getOwnPropertyNames(proto)
            .filter(m => typeof (contract as any)[m] === 'function' && !m.startsWith('_'));
        console.log('Contract methods:', methods.join(', '));

        // Try calling different methods to get calldata
        const tryMethods = ['name', 'symbol', 'totalSupply', 'decimals', 'balanceOf'];
        let calldata: Uint8Array | null = null;

        for (const method of tryMethods) {
            try {
                let sim: any;
                if (method === 'balanceOf') {
                    sim = await (contract as any)[method](wallet.address);
                } else {
                    sim = await (contract as any)[method]();
                }
                if (sim?.calldata) {
                    calldata = sim.calldata;
                    console.log(`  ${method}() simulation OK, calldata: ${calldata!.length} bytes`);
                    break;
                }
            } catch (e: any) {
                console.log(`  ${method}(): ${e.message?.slice(0, 80)}`);
            }
        }

        if (!calldata) {
            console.log('  No valid calldata found, skipping');
            continue;
        }

        // Build and send interaction TX with ML-DSA flags
        console.log('\n  Building interaction TX...');
        const utxos: UTXO[] = await limitedProvider.fetchUTXO({
            address: wallet.p2tr,
            minAmount: 10_000n,
            requestedAmount: 200_000n,
        });

        const challenge = await provider.getChallenge();
        const factory = new TransactionFactory();

        try {
            const result = await factory.signInteraction({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                network: NETWORK,
                from: wallet.p2tr,
                to: contractAddr,
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

            console.log('  TX built!');

            // Broadcast
            const fundRes = await limitedProvider.broadcastTransaction(result.fundingTransaction, false);
            if (!fundRes?.success) {
                console.error('  Funding failed:', fundRes?.error);
                continue;
            }
            console.log(`  Funding TX: ${fundRes.result}`);

            await new Promise((r) => setTimeout(r, 3000));

            const intRes = await limitedProvider.broadcastTransaction(result.interactionTransaction, false);
            console.log(`  Interaction: ${intRes?.success ? 'OK' : 'FAILED'} ${intRes?.result || intRes?.error || ''}`);

            if (intRes?.success) {
                console.log('\n  ML-DSA KEY LINKING TX BROADCAST SUCCESSFULLY!');
                console.log(`  TX: ${intRes.result}`);
                console.log('  Wait ~10 min for block confirmation, then deploy.');
                wallet.zeroize();
                return;
            } else if (intRes && 'result' in intRes) {
                const raw = (intRes as Record<string, unknown>).result;
                if (typeof raw === 'string') {
                    try {
                        console.log(`  Revert: ${Buffer.from(raw, 'base64').toString('utf8')}`);
                    } catch { /* */ }
                }
            }
        } catch (e: any) {
            console.error(`  Error: ${e.message?.slice(0, 200)}`);
        }
    }

    console.log('\nAll contract attempts exhausted.');
    wallet.zeroize();
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
