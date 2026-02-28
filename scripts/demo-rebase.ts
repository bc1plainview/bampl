/**
 * BAMPL Elastic Supply Demo
 *
 * Demonstrates the rebase mechanism:
 *   Phase 1: Post a price 20% above peg → wait for confirmation
 *   Phase 2: Trigger rebase → supply expands
 *   Phase 3: Post a price 20% below peg → wait for confirmation
 *   Phase 4: Trigger rebase → supply contracts
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function fmt(val: bigint, dec = 8): string {
    const neg = val < 0n;
    const abs = neg ? -val : val;
    const s = abs.toString().padStart(dec + 1, '0');
    return (neg ? '-' : '') + s.slice(0, -dec) + '.' + s.slice(-dec);
}

async function readState() {
    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    const [ts, price, target, epoch, canReb, nextBlock, bal, lag, elen] = await Promise.all([
        (c as any).totalSupply(),
        (c as any).currentPrice(),
        (c as any).targetPrice(),
        (c as any).currentEpoch(),
        (c as any).canRebase(),
        (c as any).nextRebaseBlock(),
        (c as any).balanceOf(wallet.address),
        (c as any).rebaseLag(),
        (c as any).epochLength(),
    ]);

    const data = {
        totalSupply: BigInt(ts.properties.totalSupply),
        oraclePrice: BigInt(price.properties.price),
        targetPrice: BigInt(target.properties.target),
        epoch: BigInt(epoch.properties.epoch),
        canRebase: canReb.properties.ready,
        nextBlock: BigInt(nextBlock.properties.blockHeight),
        balance: BigInt(bal.properties.balance),
        lag: BigInt(lag.properties.lag),
        epochLength: BigInt(elen.properties.epochLength),
    };

    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│  BAMPL Contract State                           │');
    console.log('├─────────────────────────────────────────────────┤');
    console.log(`│  Total Supply:    ${fmt(data.totalSupply)} BAMPL`);
    console.log(`│  Oracle Price:    ${fmt(data.oraclePrice)} MOTO`);
    console.log(`│  Target Price:    ${fmt(data.targetPrice)} MOTO`);
    console.log(`│  Epoch:           ${data.epoch}`);
    console.log(`│  Can Rebase:      ${data.canRebase}`);
    console.log(`│  Your Balance:    ${fmt(data.balance)} BAMPL`);
    console.log('└─────────────────────────────────────────────────┘');

    return data;
}

async function sendTx(label: string, simResult: any): Promise<string | null> {
    if (!simResult?.calldata) {
        console.log(`  ${label}: simulation failed`);
        return null;
    }
    console.log(`  ${label}: simulation OK`);

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
        console.log(`  ${label}: TX ${txResult.transactionId} (${txResult.peerAcknowledgements} peers)`);
        return txResult.transactionId;
    }
    console.log(`  ${label}: no TX ID`);
    return null;
}

async function waitForBlock(label: string, maxWait = 180) {
    console.log(`  Waiting for ${label} to confirm...`);
    const startPrice = (await readState()).oraclePrice;
    for (let i = 0; i < maxWait; i++) {
        await sleep(10_000);
        try {
            const state = await readState();
            // Check if state actually changed (TX confirmed)
            if (state.oraclePrice !== startPrice || state.epoch > 0n || i > 6) {
                console.log(`  Confirmed after ~${(i + 1) * 10}s`);
                return state;
            }
        } catch {
            // ignore transient errors
        }
        if (i % 3 === 2) console.log(`  Still waiting... (${(i + 1) * 10}s)`);
    }
    console.log('  Timed out waiting for confirmation');
    return await readState();
}

async function main() {
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║    BAMPL ELASTIC SUPPLY DEMO                      ║');
    console.log('║    Ampleforth-style rebase on Bitcoin L1           ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
    console.log(`Contract: ${CONTRACT}\n`);

    // ── Initial State ──
    console.log('=== INITIAL STATE ===');
    const initial = await readState();

    // ── Phase 1: Post price above peg ──
    console.log('\n=== PHASE 1: POST PRICE ABOVE PEG ===');
    console.log('  Posting 1.20 MOTO (20% above 1.00 target)...');
    const c1 = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c1.setSender(wallet.address);
    const sim1 = await (c1 as any).postPrice(120_000_000n);
    const tx1 = await sendTx('postPrice(1.20)', sim1);
    if (!tx1) return;

    console.log('\n  Waiting for price update to confirm in a block...');
    for (let i = 0; i < 60; i++) {
        await sleep(10_000);
        const s = await readState();
        if (s.oraclePrice === 120_000_000n) {
            console.log(`  Price confirmed after ~${(i + 1) * 10}s!`);
            break;
        }
        if (i % 3 === 2) console.log(`  Waiting... (${(i + 1) * 10}s)`);
    }

    // ── Phase 2: Trigger expansion rebase ──
    console.log('\n=== PHASE 2: TRIGGER EXPANSION REBASE ===');
    const c2 = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c2.setSender(wallet.address);

    try {
        const sim2 = await (c2 as any).rebase();
        const tx2 = await sendTx('rebase()', sim2);
        if (!tx2) {
            console.log('  Rebase TX failed to send');
            return;
        }
    } catch (e: any) {
        console.log('  Rebase error:', e.message?.slice(0, 200));
        console.log('  Epoch may not have elapsed yet. Wait for next block.');
        return;
    }

    console.log('\n  Waiting for rebase to confirm...');
    for (let i = 0; i < 60; i++) {
        await sleep(10_000);
        const s = await readState();
        if (s.epoch > initial.epoch) {
            console.log(`  Rebase confirmed after ~${(i + 1) * 10}s!`);
            const delta = s.totalSupply - initial.totalSupply;
            const pct = Number(delta * 10000n / initial.totalSupply) / 100;
            console.log(`\n  EXPANSION: Supply ${fmt(initial.totalSupply)} → ${fmt(s.totalSupply)} BAMPL`);
            console.log(`  Change: +${fmt(delta)} BAMPL (+${pct}%)`);
            console.log(`  Your balance: ${fmt(initial.balance)} → ${fmt(s.balance)} BAMPL`);
            break;
        }
        if (i % 3 === 2) console.log(`  Waiting... (${(i + 1) * 10}s)`);
    }

    // ── Phase 3: Post price below peg ──
    console.log('\n=== PHASE 3: POST PRICE BELOW PEG ===');
    console.log('  Posting 0.80 MOTO (20% below target)...');
    const c3 = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c3.setSender(wallet.address);
    const sim3 = await (c3 as any).postPrice(80_000_000n);
    const tx3 = await sendTx('postPrice(0.80)', sim3);
    if (!tx3) return;

    console.log('\n  Waiting for price update...');
    for (let i = 0; i < 60; i++) {
        await sleep(10_000);
        const s = await readState();
        if (s.oraclePrice === 80_000_000n) {
            console.log(`  Price confirmed after ~${(i + 1) * 10}s!`);
            break;
        }
        if (i % 3 === 2) console.log(`  Waiting... (${(i + 1) * 10}s)`);
    }

    // Read state after price confirmed
    const midState = await readState();

    // ── Phase 4: Trigger contraction rebase ──
    console.log('\n=== PHASE 4: TRIGGER CONTRACTION REBASE ===');
    const c4 = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c4.setSender(wallet.address);

    try {
        const sim4 = await (c4 as any).rebase();
        const tx4 = await sendTx('rebase()', sim4);
        if (!tx4) {
            console.log('  Rebase TX failed');
            return;
        }
    } catch (e: any) {
        console.log('  Rebase error:', e.message?.slice(0, 200));
        return;
    }

    console.log('\n  Waiting for rebase to confirm...');
    for (let i = 0; i < 60; i++) {
        await sleep(10_000);
        const s = await readState();
        if (s.epoch > midState.epoch) {
            console.log(`  Rebase confirmed after ~${(i + 1) * 10}s!`);
            const delta = s.totalSupply - midState.totalSupply;
            const pct = Number(delta * 10000n / midState.totalSupply) / 100;
            console.log(`\n  CONTRACTION: Supply ${fmt(midState.totalSupply)} → ${fmt(s.totalSupply)} BAMPL`);
            console.log(`  Change: ${fmt(delta)} BAMPL (${pct}%)`);
            console.log(`  Your balance: ${fmt(midState.balance)} → ${fmt(s.balance)} BAMPL`);
            break;
        }
        if (i % 3 === 2) console.log(`  Waiting... (${(i + 1) * 10}s)`);
    }

    // ── Final summary ──
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║    DEMO COMPLETE                                  ║');
    console.log('╚═══════════════════════════════════════════════════╝');
    const final = await readState();
    console.log(`\n  Initial supply:  ${fmt(initial.totalSupply)} BAMPL`);
    console.log(`  Final supply:    ${fmt(final.totalSupply)} BAMPL`);
    console.log(`  Net change:      ${fmt(final.totalSupply - initial.totalSupply)} BAMPL`);
    console.log(`  Rebases done:    ${final.epoch}`);
    console.log(`\n  Frontend: http://localhost:5174/`);
}

main().catch(err => { console.error('FATAL:', err.message?.slice(0, 500)); process.exit(1); });
