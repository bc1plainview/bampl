/**
 * BAMPL Livestream Demo Script
 *
 * Runs a dramatic sequence of price changes and rebases to show off
 * the elastic supply mechanism. Each TX chains from the previous one's
 * change UTXO so we can fire rapidly without waiting for blocks.
 *
 * Usage: npx tsx demo-livestream.ts [rounds]
 */
import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const limitedProvider = new OPNetLimitedProvider(RPC_URL);

const ROUNDS = parseInt(process.argv[2] || '5', 10);

function fmt(val: bigint, dec = 8): string {
    const s = val.toString().padStart(dec + 1, '0');
    return s.slice(0, -dec) + '.' + s.slice(-dec);
}

function fmtSupply(val: bigint): string {
    const num = Number(val) / 1e8;
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function sendTx(
    contract: ReturnType<typeof getContract>,
    method: string,
    args: unknown[],
    label: string,
): Promise<boolean> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${label}`);
    console.log('='.repeat(60));

    try {
        // Simulate
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sim = await (contract as any)[method](...args);
        if (!sim?.calldata) {
            console.log('  Simulation failed - skipping');
            return false;
        }

        // Fetch fresh UTXOs (includes mempool change outputs)
        const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
        if (utxos.length === 0) {
            console.log('  No UTXOs available - waiting...');
            return false;
        }
        console.log(`  UTXOs: ${utxos.length}, total: ${utxos.reduce((s: bigint, u: { value: bigint }) => s + u.value, 0n)} sats`);

        const challenge = await provider.getChallenge();

        const result = await sim.sendTransaction({
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

        if (result?.transactionId) {
            console.log(`  TX: ${result.transactionId}`);
            console.log(`  Peers: ${result.peerAcknowledgements}`);
            return true;
        }
        console.log('  TX failed - no transaction ID');
        return false;
    } catch (err: unknown) {
        console.error(`  ERROR: ${(err as Error).message?.slice(0, 200)}`);
        return false;
    }
}

async function readState(contract: ReturnType<typeof getContract>) {
    const [tsRes, pRes, tRes, epRes, crRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contract as any).totalSupply(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contract as any).currentPrice(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contract as any).targetPrice(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contract as any).currentEpoch(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contract as any).canRebase(),
    ]);

    return {
        supply: BigInt(tsRes.properties.totalSupply as string),
        price: BigInt(pRes.properties.price as string),
        target: BigInt(tRes.properties.target as string),
        epoch: BigInt(epRes.properties.epoch as string),
        canRebase: crRes.properties.ready as boolean,
    };
}

async function main() {
    console.log('\n');
    console.log('  ######   ####  ##   ## ###### ##');
    console.log('  ##   ## ##  ## ### ### ##   ## ##');
    console.log('  ######  ###### ## # ## ###### ##');
    console.log('  ##   ## ##  ## ##   ## ##     ##');
    console.log('  ######  ##  ## ##   ## ##     ######');
    console.log('\n  BitAmple Elastic Supply Demo');
    console.log(`  Running ${ROUNDS} expansion + contraction rounds\n`);

    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    // Read initial state
    let state = await readState(c);
    console.log('--- INITIAL STATE ---');
    console.log(`  Supply:    ${fmtSupply(state.supply)} BAMPL`);
    console.log(`  Price:     ${fmt(state.price)} MOTO`);
    console.log(`  Target:    ${fmt(state.target)} MOTO`);
    console.log(`  Epoch:     ${state.epoch}`);
    console.log(`  Can Rebase: ${state.canRebase}`);

    const startSupply = state.supply;
    let txCount = 0;
    let failCount = 0;

    // Demo sequence for each round:
    // 1. Price way up -> Rebase (EXPANSION)
    // 2. Price way down -> Rebase (CONTRACTION)
    // This creates a dramatic visual oscillation

    const priceSequence = [
        // Round pattern: big expansion, then big contraction
        { price: 200_000_000n, label: 'PRICE SURGE: 2.00 MOTO (100% above target)' },
        { price: null, label: 'REBASE: MASSIVE EXPANSION' },
        { price: 50_000_000n, label: 'PRICE CRASH: 0.50 MOTO (50% below target)' },
        { price: null, label: 'REBASE: CONTRACTION' },
    ];

    for (let round = 0; round < ROUNDS; round++) {
        console.log(`\n\n${'#'.repeat(60)}`);
        console.log(`  ROUND ${round + 1} of ${ROUNDS}`);
        console.log('#'.repeat(60));

        for (const step of priceSequence) {
            // Brief pause between TXs to let mempool settle
            if (txCount > 0) {
                console.log('\n  Waiting 3s for mempool...');
                await new Promise(r => setTimeout(r, 3000));
            }

            if (step.price !== null) {
                // Post price
                const ok = await sendTx(c, 'postPrice', [step.price], step.label);
                if (ok) txCount++;
                else failCount++;
            } else {
                // Trigger rebase
                // Re-read state to check if rebase is available
                state = await readState(c);
                if (!state.canRebase) {
                    console.log(`\n  Cannot rebase yet (epoch ${state.epoch}). Setting epoch length to 1...`);
                    const ok = await sendTx(c, 'setEpochLength', [1n], 'SET EPOCH LENGTH = 1 BLOCK');
                    if (ok) {
                        txCount++;
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        failCount++;
                    }
                }

                const ok = await sendTx(c, 'rebase', [], step.label);
                if (ok) {
                    txCount++;
                    // Read new state after rebase
                    await new Promise(r => setTimeout(r, 1000));
                    state = await readState(c);
                    console.log(`\n  >>> Supply: ${fmtSupply(state.supply)} BAMPL | Epoch: ${state.epoch}`);
                } else {
                    failCount++;
                }
            }
        }

        // Vary the prices each round for visual interest
        if (round % 2 === 0) {
            priceSequence[0].price = 250_000_000n; // 2.50 MOTO
            priceSequence[0].label = 'PRICE MOON: 2.50 MOTO (150% above target)';
            priceSequence[2].price = 30_000_000n; // 0.30 MOTO
            priceSequence[2].label = 'PRICE NUKE: 0.30 MOTO (70% below target)';
        } else {
            priceSequence[0].price = 180_000_000n; // 1.80 MOTO
            priceSequence[0].label = 'PRICE PUMP: 1.80 MOTO (80% above target)';
            priceSequence[2].price = 60_000_000n; // 0.60 MOTO
            priceSequence[2].label = 'PRICE DIP: 0.60 MOTO (40% below target)';
        }
    }

    // Final state
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('  DEMO COMPLETE');
    console.log('='.repeat(60));

    state = await readState(c);
    console.log(`  Starting Supply: ${fmtSupply(startSupply)} BAMPL`);
    console.log(`  Final Supply:    ${fmtSupply(state.supply)} BAMPL`);
    console.log(`  Final Price:     ${fmt(state.price)} MOTO`);
    console.log(`  Final Epoch:     ${state.epoch}`);
    console.log(`  Transactions:    ${txCount} sent, ${failCount} failed`);
    console.log(`\n  Watch the dashboard at http://localhost:5174`);
    console.log(`  Supply changes appear after block confirmation (~10 min)\n`);
}

main().catch(err => console.error('Fatal:', (err as Error).message?.slice(0, 500)));
