/**
 * BAMPL Continuous Rebase Simulator
 *
 * Runs forever, automatically posting prices and triggering rebases.
 * Self-heals from "Could not decode transaction" errors by creating
 * fresh SDK instances for each transaction.
 *
 * Usage: npx tsx simulator.ts
 *   Optional: npx tsx simulator.ts --fast  (shorter wait between actions)
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

const FAST_MODE = process.argv.includes('--fast');
const POLL_INTERVAL = FAST_MODE ? 5_000 : 10_000; // How often to check for new blocks
const ACTION_DELAY = FAST_MODE ? 2_000 : 5_000;   // Pause between actions in same block window

// Price sequence: alternates expansion and contraction to show off rebasing
const PRICE_SEQUENCE: { price: bigint; label: string }[] = [
    { price: 250_000_000n, label: '2.50 MOTO (+150% above target)' },
    { price: 300_000_000n, label: '3.00 MOTO (+200% above target)' },
    { price: 50_000_000n,  label: '0.50 MOTO (-50% below target)' },
    { price: 25_000_000n,  label: '0.25 MOTO (-75% below target)' },
    { price: 180_000_000n, label: '1.80 MOTO (+80% above target)' },
    { price: 500_000_000n, label: '5.00 MOTO (+400% above target)' },
    { price: 10_000_000n,  label: '0.10 MOTO (-90% below target)' },
    { price: 60_000_000n,  label: '0.60 MOTO (-40% below target)' },
    { price: 400_000_000n, label: '4.00 MOTO (+300% above target)' },
    { price: 30_000_000n,  label: '0.30 MOTO (-70% below target)' },
    { price: 100_000_000n, label: '1.00 MOTO (back to target)' },
    { price: 200_000_000n, label: '2.00 MOTO (+100% above target)' },
];

let priceIndex = 0;
let txCount = 0;
let failCount = 0;
let rebaseCount = 0;

function timestamp(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function log(msg: string) {
    console.log(`  [${timestamp()}] ${msg}`);
}

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

/**
 * Create completely fresh SDK instances for every transaction.
 * This is the key to surviving the "Could not decode transaction" bug —
 * the error is stateful, so fresh instances reset the internal state.
 */
function freshInstances() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const contract = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    contract.setSender(wallet.address);
    return { provider, limitedProvider, contract };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readState(contract: any) {
    const [tsRes, pRes, tRes, epRes, crRes, nrbRes] = await Promise.all([
        contract.totalSupply(),
        contract.currentPrice(),
        contract.targetPrice(),
        contract.currentEpoch(),
        contract.canRebase(),
        contract.nextRebaseBlock(),
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

/**
 * Send a transaction with full error recovery.
 * Creates fresh SDK instances to avoid stale state.
 * Returns true on success, false on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendTx(method: string, args: unknown[], label: string): Promise<boolean> {
    log(`>> ${label}`);

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const { provider, limitedProvider, contract } = freshInstances();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sim = await (contract as any)[method](...args);
            if (!sim?.calldata) {
                log('   Simulation failed — skipping');
                return false;
            }

            const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
            if (utxos.length === 0) {
                log('   No UTXOs available — waiting');
                return false;
            }

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
                log(`   TX: ${result.transactionId} (${result.peerAcknowledgements} peers)`);
                txCount++;
                return true;
            }

            log('   No TX ID returned');
            return false;
        } catch (err: unknown) {
            const msg = (err as Error).message?.slice(0, 150) || 'Unknown error';
            if (attempt < 2 && msg.includes('Could not decode')) {
                log(`   Attempt ${attempt} failed: ${msg}`);
                log('   Retrying with fresh instances...');
                await sleep(2000);
                continue;
            }
            log(`   ERROR: ${msg}`);
            failCount++;
            return false;
        }
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function getBlockNumber(): Promise<bigint> {
    const { provider } = freshInstances();
    const num = await provider.getBlockNumber();
    return BigInt(num);
}

async function waitForBlock(targetBlock: bigint, label: string): Promise<bigint> {
    process.stdout.write(`  [${timestamp()}] Waiting for block ${targetBlock} (${label})`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const current = await getBlockNumber();
            if (current >= targetBlock) {
                console.log(` -> block ${current}`);
                return current;
            }
        } catch { /* retry */ }
        process.stdout.write('.');
        await sleep(POLL_INTERVAL);
    }
}

/**
 * Main simulation loop. Runs forever:
 *   1. Post a price from the sequence
 *   2. Wait for block confirmation
 *   3. Trigger rebase (if eligible)
 *   4. Wait for block confirmation
 *   5. Repeat with next price
 */
async function main() {
    console.log('\n');
    console.log('  ============================================');
    console.log('  BAMPL Continuous Rebase Simulator');
    console.log('  ============================================');
    console.log(`  Mode:     ${FAST_MODE ? 'FAST' : 'NORMAL'}`);
    console.log(`  Contract: ${CONTRACT}`);
    console.log(`  Deployer: ${wallet.p2tr}`);
    console.log('  Press Ctrl+C to stop.\n');

    // Read initial state
    const { contract: readContract } = freshInstances();
    let state = await readState(readContract);
    log(`Starting state: Supply=${fmtK(state.supply)} Price=${fmt(state.price)} Epoch=${state.epoch}`);

    let currentBlock = await getBlockNumber();
    log(`Current block: ${currentBlock}`);

    // Main loop — runs forever
    let cycle = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        cycle++;
        const step = PRICE_SEQUENCE[priceIndex % PRICE_SEQUENCE.length]!;
        priceIndex++;

        console.log(`\n  ${'='.repeat(50)}`);
        log(`CYCLE ${cycle} | Price -> ${step.label}`);
        console.log(`  ${'='.repeat(50)}`);

        // Step 1: Post the price
        const priceOk = await sendTx('postPrice', [step.price], `Post price: ${step.label}`);
        if (!priceOk) {
            log('Price post failed. Waiting and retrying next cycle...');
            await sleep(ACTION_DELAY);
            continue;
        }

        // Step 2: Wait for next block
        currentBlock = await getBlockNumber();
        currentBlock = await waitForBlock(currentBlock + 1n, 'price confirmation');
        await sleep(ACTION_DELAY);

        // Step 3: Check if rebase is possible, then trigger
        const { contract: stateContract } = freshInstances();
        state = await readState(stateContract);
        log(`State: Supply=${fmtK(state.supply)} Price=${fmt(state.price)} Epoch=${state.epoch} CanRebase=${state.canRebase}`);

        if (state.canRebase) {
            const prevSupply = state.supply;
            const rebaseOk = await sendTx('rebase', [], 'Trigger rebase');

            if (rebaseOk) {
                rebaseCount++;

                // Wait for rebase to confirm
                currentBlock = await getBlockNumber();
                currentBlock = await waitForBlock(currentBlock + 1n, 'rebase confirmation');

                // Show result
                const { contract: postContract } = freshInstances();
                state = await readState(postContract);
                const delta = state.supply - prevSupply;
                const deltaStr = delta >= 0n ? `+${fmtK(delta)}` : `-${fmtK(-delta)}`;
                const color = delta > 0n ? '\x1b[32m' : delta < 0n ? '\x1b[31m' : '\x1b[34m';
                log(`${color}REBASE #${rebaseCount}: Supply ${fmtK(prevSupply)} -> ${fmtK(state.supply)} (${deltaStr})\x1b[0m`);
            } else {
                log('Rebase TX failed. Will retry next cycle.');
            }
        } else {
            log(`Cannot rebase yet. Next eligible at block ${state.nextBlock}`);
            if (currentBlock < state.nextBlock) {
                currentBlock = await waitForBlock(state.nextBlock, 'epoch cooldown');
            }
        }

        // Stats
        log(`Stats: ${txCount} sent, ${failCount} failed, ${rebaseCount} rebases`);

        // Brief pause before next cycle
        await sleep(ACTION_DELAY);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(`\n\n  Simulator stopped.`);
    console.log(`  Total TXs: ${txCount} sent, ${failCount} failed`);
    console.log(`  Rebases: ${rebaseCount}`);
    process.exit(0);
});

main().catch(err => {
    console.error(`\n  Fatal: ${(err as Error).message?.slice(0, 300)}`);
    console.error('  Restarting in 30s...');
    setTimeout(() => {
        main().catch(() => process.exit(1));
    }, 30_000);
});
