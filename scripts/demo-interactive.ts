/**
 * BAMPL Interactive Livestream Demo
 *
 * Waits for block confirmations between rebases.
 * Each cycle: post price -> wait for block -> rebase -> wait for block -> repeat
 *
 * Usage: npx tsx demo-interactive.ts
 *   Then follow the prompts or let it auto-run.
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

function fmt(val: bigint, dec = 8): string {
    const s = val.toString().padStart(dec + 1, '0');
    return s.slice(0, -dec) + '.' + s.slice(-dec);
}

function fmtK(val: bigint): string {
    const num = Number(val) / 1e8;
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toFixed(2);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readState(c: any) {
    const [tsRes, pRes, tRes, epRes, crRes, nrbRes] = await Promise.all([
        c.totalSupply(),
        c.currentPrice(),
        c.targetPrice(),
        c.currentEpoch(),
        c.canRebase(),
        c.nextRebaseBlock(),
    ]);
    return {
        supply: BigInt(tsRes.properties.totalSupply as string),
        price: BigInt(pRes.properties.price as string),
        target: BigInt(tRes.properties.target as string),
        epoch: BigInt(epRes.properties.epoch as string),
        canRebase: crRes.properties.ready as boolean,
        nextBlock: BigInt(nrbRes.properties.blockHeight as string),
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendTx(c: any, method: string, args: unknown[], label: string): Promise<boolean> {
    console.log(`\n  >> ${label}`);
    try {
        const sim = await c[method](...args);
        if (!sim?.calldata) {
            console.log('     Simulation failed');
            return false;
        }

        const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
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
            console.log(`     TX: ${result.transactionId} (${result.peerAcknowledgements} peers)`);
            return true;
        }
        return false;
    } catch (err: unknown) {
        console.error(`     ERROR: ${(err as Error).message?.slice(0, 200)}`);
        return false;
    }
}

async function waitForBlock(targetBlock: bigint, label: string) {
    process.stdout.write(`\n  Waiting for block ${targetBlock} (${label})...`);
    let current = 0n;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const resp = await provider.getBlockNumber();
            current = BigInt(resp);
            if (current >= targetBlock) {
                console.log(` MINED! (block ${current})`);
                return current;
            }
        } catch { /* retry */ }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 10_000));
    }
}

async function printState(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: { supply: bigint; price: bigint; target: bigint; epoch: bigint; canRebase: boolean; nextBlock: bigint },
    label: string,
) {
    const dev = Number(state.target) > 0
        ? ((Number(state.price) - Number(state.target)) / Number(state.target) * 100).toFixed(1)
        : '0';
    const mode = Number(dev) > 5 ? 'EXPANSION' : Number(dev) < -5 ? 'CONTRACTION' : 'EQUILIBRIUM';
    const modeColor = mode === 'EXPANSION' ? '\x1b[32m' : mode === 'CONTRACTION' ? '\x1b[31m' : '\x1b[34m';

    console.log(`\n  ┌─── ${label} ${'─'.repeat(Math.max(0, 44 - label.length))}┐`);
    console.log(`  │  Supply:    ${fmtK(state.supply).padStart(14)} BAMPL              │`);
    console.log(`  │  Price:     ${fmt(state.price).padStart(14)} MOTO               │`);
    console.log(`  │  Target:    ${fmt(state.target).padStart(14)} MOTO               │`);
    console.log(`  │  Deviation: ${(dev + '%').padStart(14)}                      │`);
    console.log(`  │  Mode:      ${modeColor}${mode.padStart(14)}\x1b[0m                      │`);
    console.log(`  │  Epoch:     ${state.epoch.toString().padStart(14)}                      │`);
    console.log(`  │  Can Rebase:${(state.canRebase ? 'YES' : 'NO').padStart(14)}                      │`);
    console.log(`  └${'─'.repeat(52)}┘`);
}

const DEMO_SEQUENCE = [
    // Each step: [price, description]
    // null price = trigger rebase instead of posting price
    { price: 300_000_000n, desc: 'HUGE PUMP to 3.00 MOTO (+200% above target!)' },
    { price: null, desc: 'REBASE --- EXPANSION (supply GROWS)' },
    { price: 25_000_000n, desc: 'MEGA CRASH to 0.25 MOTO (-75% below target!)' },
    { price: null, desc: 'REBASE --- CONTRACTION (supply SHRINKS)' },
    { price: 500_000_000n, desc: 'MOON to 5.00 MOTO (+400% above target!)' },
    { price: null, desc: 'REBASE --- MASSIVE EXPANSION' },
    { price: 10_000_000n, desc: 'NUKE to 0.10 MOTO (-90% below target!)' },
    { price: null, desc: 'REBASE --- SEVERE CONTRACTION' },
    // Bring back to equilibrium
    { price: 100_000_000n, desc: 'RECOVER to 1.00 MOTO (back on target)' },
];

async function main() {
    console.log('\x1b[36m');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║     BAMPL ELASTIC SUPPLY LIVE DEMO       ║');
    console.log('  ║     Bitcoin\'s First Rebasing Token        ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('\x1b[0m');

    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    let state = await readState(c);
    const startBlock = BigInt(await provider.getBlockNumber());
    await printState(state, 'STARTING STATE');

    const startSupply = state.supply;
    let txCount = 0;

    console.log(`\n  Current block: ${startBlock}`);
    console.log('  Each step sends a TX, then waits for the next block.');
    console.log('  Dashboard: http://localhost:5174\n');

    for (let i = 0; i < DEMO_SEQUENCE.length; i++) {
        const step = DEMO_SEQUENCE[i]!;

        console.log(`\n${'━'.repeat(56)}`);
        console.log(`  STEP ${i + 1}/${DEMO_SEQUENCE.length}: ${step.desc}`);
        console.log('━'.repeat(56));

        if (step.price !== null) {
            // Post price
            const ok = await sendTx(c, 'postPrice', [step.price], `Post oracle price: ${fmt(step.price)} MOTO`);
            if (ok) txCount++;

            // Wait for block confirmation
            const currentBlock = BigInt(await provider.getBlockNumber());
            await waitForBlock(currentBlock + 1n, 'price update to confirm');

            // Read & display new state
            state = await readState(c);
            await printState(state, `AFTER PRICE POST`);
        } else {
            // Rebase
            // First check if we can rebase
            state = await readState(c);
            if (!state.canRebase) {
                console.log(`\n  Rebase not ready. Need block >= ${state.nextBlock}`);
                const currentBlock = BigInt(await provider.getBlockNumber());
                if (currentBlock < state.nextBlock) {
                    await waitForBlock(state.nextBlock, 'epoch cooldown');
                }
                // Re-read after waiting
                state = await readState(c);
            }

            if (state.canRebase) {
                const prevSupply = state.supply;
                const ok = await sendTx(c, 'rebase', [], 'Trigger rebase');
                if (ok) txCount++;

                // Wait for block confirmation
                const currentBlock = BigInt(await provider.getBlockNumber());
                await waitForBlock(currentBlock + 1n, 'rebase to confirm');

                // Read & display new state
                state = await readState(c);
                await printState(state, 'AFTER REBASE');

                // Show delta
                const delta = Number(state.supply - prevSupply) / 1e8;
                const deltaStr = delta >= 0 ? `+${fmtK(state.supply - prevSupply)}` : fmtK(state.supply - prevSupply);
                const color = delta > 0 ? '\x1b[32m' : delta < 0 ? '\x1b[31m' : '\x1b[34m';
                console.log(`\n  ${color}>>> Supply changed: ${deltaStr} BAMPL <<<\x1b[0m`);
            } else {
                console.log('  Cannot rebase - epoch not elapsed yet. Skipping.');
            }
        }
    }

    // Final summary
    console.log(`\n\n\x1b[36m${'═'.repeat(56)}`);
    console.log('  DEMO COMPLETE');
    console.log(`${'═'.repeat(56)}\x1b[0m`);

    state = await readState(c);
    console.log(`\n  Start Supply:  ${fmtK(startSupply)} BAMPL`);
    console.log(`  Final Supply:  ${fmtK(state.supply)} BAMPL`);
    const totalChange = Number(state.supply - startSupply) / 1e8;
    const changePct = (totalChange / (Number(startSupply) / 1e8) * 100).toFixed(1);
    console.log(`  Net Change:    ${totalChange >= 0 ? '+' : ''}${totalChange.toLocaleString()} BAMPL (${changePct}%)`);
    console.log(`  Final Price:   ${fmt(state.price)} MOTO`);
    console.log(`  Final Epoch:   ${state.epoch}`);
    console.log(`  Transactions:  ${txCount}`);
    console.log(`\n  Dashboard: http://localhost:5174\n`);
}

main().catch(err => console.error('Fatal:', (err as Error).message?.slice(0, 500)));
