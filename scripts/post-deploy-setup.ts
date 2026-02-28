/**
 * Post-deployment setup: waits for contract confirmation, enables demo mode, posts oracle price.
 * Uses RC packages with networks.opnetTestnet per opnet-bob guidelines.
 */
import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT_ADDRESS = process.env.BAMPL_CONTRACT_ADDRESS!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    if (!CONTRACT_ADDRESS) {
        console.error('BAMPL_CONTRACT_ADDRESS not set in .env');
        process.exit(1);
    }

    const phrase = process.env.DEPLOYER_MNEMONIC;
    if (!phrase) { console.error('Set DEPLOYER_MNEMONIC in .env'); process.exit(1); }

    const mnemonic = new Mnemonic(phrase, '', NETWORK);
    const wallet = mnemonic.derive(0);
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);

    console.log(`Contract: ${CONTRACT_ADDRESS}`);
    console.log(`Deployer: ${wallet.p2tr}`);

    // ── Step 1: Wait for contract to appear on-chain ──
    console.log('\n[1/3] Waiting for deployment to confirm in a block...');
    let confirmed = false;
    for (let i = 0; i < 120; i++) {
        try {
            const contract = getContract(CONTRACT_ADDRESS, BAMPLTokenAbi, provider, NETWORK);
            contract.setSender(wallet.address);
            await (contract as any).name();
            confirmed = true;
            console.log('  Contract confirmed on-chain!');
            break;
        } catch (e) {
            const msg = (e as Error).message;
            if (msg.includes('Contract not found')) {
                if (i % 6 === 0) console.log(`  Waiting... (${i * 10}s elapsed)`);
            } else {
                console.log(`  ${msg.slice(0, 100)}`);
            }
        }
        await sleep(10_000);
    }

    if (!confirmed) {
        console.error('Timed out waiting for contract confirmation.');
        process.exit(1);
    }

    // ── Step 2: Enable demo mode ──
    console.log('\n[2/3] Enabling demo mode...');
    try {
        const contract = getContract(CONTRACT_ADDRESS, BAMPLTokenAbi, provider, NETWORK);
        contract.setSender(wallet.address);

        const simResult = await (contract as any).enableDemoMode();
        if (!simResult?.calldata) {
            console.error('  enableDemoMode simulation failed:', simResult);
            process.exit(1);
        }
        console.log('  Simulation OK');

        const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
        const challenge = await provider.getChallenge();

        const txResult = await simResult.sendTransaction({
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

        if (txResult?.transactionId) {
            console.log(`  TX: ${txResult.transactionId} (peers: ${txResult.peerAcknowledgements})`);
            console.log('  Demo mode enable TX broadcast!');
        }
    } catch (e) {
        console.error('  enableDemoMode error:', (e as Error).message?.slice(0, 200));
    }

    // Wait for demo mode TX to confirm
    console.log('  Waiting for next block...');
    await sleep(15_000);

    // ── Step 3: Post initial oracle price at peg ──
    console.log('\n[3/3] Posting initial oracle price (1.0 MOTO)...');
    try {
        const contract = getContract(CONTRACT_ADDRESS, BAMPLTokenAbi, provider, NETWORK);
        contract.setSender(wallet.address);

        const priceRaw = BigInt(1 * 10 ** 8); // 1.0 MOTO
        const simResult = await (contract as any).postPrice(priceRaw);
        if (!simResult?.calldata) {
            console.error('  postPrice simulation failed:', simResult);
            process.exit(1);
        }
        console.log('  Simulation OK');

        const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
        const challenge = await provider.getChallenge();

        const txResult = await simResult.sendTransaction({
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

        if (txResult?.transactionId) {
            console.log(`  TX: ${txResult.transactionId} (peers: ${txResult.peerAcknowledgements})`);
            console.log('  Oracle price posted: 1.0 MOTO');
        }
    } catch (e) {
        console.error('  postPrice error:', (e as Error).message?.slice(0, 200));
        console.log('  (Will need to run again after next block confirms)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('  BAMPL SETUP COMPLETE!');
    console.log(`  Contract: ${CONTRACT_ADDRESS}`);
    console.log('  Frontend: http://localhost:5174/');
    console.log('='.repeat(60));
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
