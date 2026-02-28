/**
 * BAMPL Demo Controller
 *
 * Interactive CLI for controlling the BAMPL elastic supply token during
 * a livestream demo. Automates oracle price posting, rebase triggering,
 * and state inspection so the presenter just presses buttons.
 *
 * Usage:
 *   1. Set DEPLOYER_WIF (or DEPLOYER_MNEMONIC) and BAMPL_CONTRACT_ADDRESS in .env
 *   2. Run: npx tsx demo.ts
 *
 * The script connects to OPNet Testnet and interacts with the deployed
 * BAMPL contract via getContract() from the opnet package. All transactions
 * use the backend signer pattern (signer + mldsaSigner in sendTransaction).
 */

import 'dotenv/config';
import readline from 'node:readline';

import {
    getContract,
    JSONRpcProvider,
    OP_20_ABI,
    type IOP20Contract,
} from 'opnet';
import {
    Mnemonic,
    Wallet,
    Address,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const BAMPL_ADDRESS = process.env.BAMPL_CONTRACT_ADDRESS;
const DEPLOYER_WIF = process.env.DEPLOYER_WIF;

// BAMPL has 8 decimals
const DECIMALS = 8;
const ONE_TOKEN = 10n ** BigInt(DECIMALS); // 1e8

// Transaction parameters for backend signing
const MAX_SAT_TO_SPEND = 50_000n;
const FEE_RATE = 10;

// ---------------------------------------------------------------------------
// BAMPL Contract ABI Extension
// ---------------------------------------------------------------------------
// The BAMPL contract extends OP_20 with custom methods for elastic supply.
// We define a custom ABI that includes these methods plus standard OP_20.
//
// TODO: If the actual BAMPL contract has different method selectors or
// parameter types, update this ABI accordingly. The method names and
// parameter structures here match a typical Ampleforth-style elastic
// supply contract.

import { BitcoinInterfaceAbi, BitcoinAbiTypes, ABIDataTypes } from 'opnet';

const BAMPL_ABI: BitcoinInterfaceAbi = [
    // OP_20 standard methods (included for completeness)
    ...OP_20_ABI,

    // === BAMPL Custom Methods ===

    {
        name: 'postPrice',
        inputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'rebase',
        inputs: [],
        outputs: [{ name: 'newSupply', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'enableDemoMode',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },

    // === View Methods ===

    {
        name: 'currentPrice',
        inputs: [],
        outputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
        constant: true,
    },
    {
        name: 'currentEpoch',
        inputs: [],
        outputs: [{ name: 'epoch', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
        constant: true,
    },
    {
        name: 'deviationThreshold',
        inputs: [],
        outputs: [{ name: 'threshold', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
        constant: true,
    },
    {
        name: 'targetPrice',
        inputs: [],
        outputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
        constant: true,
    },
    {
        name: 'canRebase',
        inputs: [],
        outputs: [{ name: 'ready', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
        constant: true,
    },
];

// ---------------------------------------------------------------------------
// Type for BAMPL contract
// ---------------------------------------------------------------------------

// TODO: If you have a generated interface from the BAMPL contract ABI,
// use that instead. This generic typing works but lacks full type safety
// on return properties.
type IBAMPLContract = IOP20Contract & {
    postPrice(price: bigint): Promise<any>;
    rebase(): Promise<any>;
    enableDemoMode(): Promise<any>;
    currentPrice(): Promise<any>;
    currentEpoch(): Promise<any>;
    deviationThreshold(): Promise<any>;
    targetPrice(): Promise<any>;
    canRebase(): Promise<any>;
};

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let wallet: Wallet;
let provider: JSONRpcProvider;
let bampl: IBAMPLContract;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function banner(text: string): void {
    const line = '='.repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${text}`);
    console.log(`${line}\n`);
}

function formatTokenAmount(raw: bigint): string {
    const whole = raw / ONE_TOKEN;
    const frac = raw % ONE_TOKEN;
    const fracStr = frac.toString().padStart(DECIMALS, '0').replace(/0+$/, '');
    if (fracStr.length === 0) return whole.toLocaleString();
    return `${whole.toLocaleString()}.${fracStr}`;
}

function formatPrice(raw: bigint): string {
    // Price is in 1e8 units where 1e8 = 1.0 MOTO
    const whole = raw / ONE_TOKEN;
    const frac = raw % ONE_TOKEN;
    const fracStr = frac.toString().padStart(DECIMALS, '0').replace(/0+$/, '');
    if (fracStr.length === 0) return `${whole}.0`;
    return `${whole}.${fracStr}`;
}

function priceToRaw(price: number): bigint {
    // Convert a decimal price (e.g., 1.5) to raw bigint (1.5 * 1e8 = 150000000n)
    return BigInt(Math.round(price * Number(ONE_TOKEN)));
}

async function sleep(ms: number): Promise<void> {
    const seconds = ms / 1000;
    process.stdout.write(`  Waiting ${seconds}s...`);
    const interval = setInterval(() => process.stdout.write('.'), 1000);
    await new Promise((r) => setTimeout(r, ms));
    clearInterval(interval);
    console.log(' done');
}

// ---------------------------------------------------------------------------
// Contract Interactions
// ---------------------------------------------------------------------------

/**
 * Get the current state of the BAMPL contract.
 */
async function getState(): Promise<{
    totalSupply: bigint;
    currentPrice: bigint;
    epoch: bigint;
    threshold: bigint;
    targetPrice: bigint;
}> {
    // Parallel view calls for speed
    const [supplyResult, priceResult, epochResult, thresholdResult, targetResult] =
        await Promise.all([
            bampl.totalSupply().catch(() => null),
            bampl.currentPrice().catch(() => null),
            bampl.currentEpoch().catch(() => null),
            bampl.deviationThreshold().catch(() => null),
            bampl.targetPrice().catch(() => null),
        ]);

    return {
        totalSupply: supplyResult?.properties?.totalSupply ?? 0n,
        currentPrice: priceResult?.properties?.price ?? ONE_TOKEN, // default 1.0
        epoch: epochResult?.properties?.epoch ?? 0n,
        threshold: thresholdResult?.properties?.threshold ?? 5n, // default 5%
        targetPrice: targetResult?.properties?.price ?? ONE_TOKEN, // default 1.0
    };
}

/**
 * Print the current contract state in a nicely formatted box.
 */
async function showState(): Promise<void> {
    console.log('\n  Fetching contract state...');
    const state = await getState();

    const priceNum = Number(state.currentPrice) / Number(ONE_TOKEN);
    const targetNum = Number(state.targetPrice) / Number(ONE_TOKEN);
    const deviation = ((priceNum - targetNum) / targetNum) * 100;
    const deviationStr = deviation >= 0 ? `+${deviation.toFixed(2)}%` : `${deviation.toFixed(2)}%`;

    console.log('');
    console.log('  +----------------------------------------------+');
    console.log(`  | Total Supply:    ${formatTokenAmount(state.totalSupply).padEnd(28)}|`);
    console.log(`  | Oracle Price:    ${formatPrice(state.currentPrice).padEnd(18)} MOTO${' '.repeat(5)}|`);
    console.log(`  | Target Price:    ${formatPrice(state.targetPrice).padEnd(18)} MOTO${' '.repeat(5)}|`);
    console.log(`  | Deviation:       ${deviationStr.padEnd(28)}|`);
    console.log(`  | Epoch:           ${state.epoch.toString().padEnd(28)}|`);
    console.log(`  | Rebase Threshold: ${state.threshold.toString().padEnd(27)}%|`);
    console.log('  +----------------------------------------------+');
    console.log('');
}

/**
 * Simulate a contract call and check for revert. Returns the simulation result.
 */
async function simulateAndSend(
    simulation: any,
    label: string,
): Promise<any> {
    // Check for revert
    if (simulation.revert) {
        let revertMsg = simulation.revert;
        // Try base64 decode
        try {
            const decoded = Buffer.from(revertMsg, 'base64').toString('utf-8');
            if (decoded.length > 0 && decoded.length < 500) {
                revertMsg = decoded;
            }
        } catch {
            // keep original
        }
        console.error(`  REVERT on ${label}: ${revertMsg}`);
        return null;
    }

    console.log(`  Simulation OK for "${label}". Sending transaction...`);

    // Estimated gas info
    if (simulation.estimatedGas) {
        console.log(`  Estimated gas: ${simulation.estimatedGas}`);
    }

    // Send the transaction with backend signer pattern
    const receipt = await simulation.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        feeRate: FEE_RATE,
        network: NETWORK,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    });

    console.log(`  TX sent: ${receipt.transactionId ?? 'pending'}`);
    return receipt;
}

/**
 * Post an oracle price to the BAMPL contract.
 */
async function postPrice(price: number): Promise<boolean> {
    const rawPrice = priceToRaw(price);
    console.log(`\n  Posting oracle price: ${price} MOTO (raw: ${rawPrice})`);

    const simulation = await bampl.postPrice(rawPrice);
    const result = await simulateAndSend(simulation, `postPrice(${price})`);
    return result !== null;
}

/**
 * Trigger a rebase on the BAMPL contract.
 */
async function triggerRebase(): Promise<{ oldSupply: bigint; newSupply: bigint } | null> {
    console.log('\n  Triggering rebase...');

    // Get supply before rebase
    const stateBefore = await getState();
    const oldSupply = stateBefore.totalSupply;

    const simulation = await bampl.rebase();
    const result = await simulateAndSend(simulation, 'rebase()');

    if (!result) return null;

    // Get supply after rebase
    await sleep(3000); // Wait for state to update
    const stateAfter = await getState();
    const newSupply = stateAfter.totalSupply;

    return { oldSupply, newSupply };
}

/**
 * Enable demo mode with short epochs.
 */
async function enableDemoMode(_epochBlocks?: number): Promise<boolean> {
    console.log(`\n  Enabling demo mode (epoch = ${epochBlocks} block(s))...`);

    const simulation = await bampl.enableDemoMode();
    const result = await simulateAndSend(simulation, 'enableDemoMode()');
    return result !== null;
}

/**
 * Print a rebase result with percentage change.
 */
function printRebaseResult(
    label: string,
    oldSupply: bigint,
    newSupply: bigint,
): void {
    const oldNum = Number(oldSupply);
    const newNum = Number(newSupply);
    const pctChange = ((newNum - oldNum) / oldNum) * 100;
    const sign = pctChange >= 0 ? '+' : '';
    const arrow = pctChange > 0 ? 'UP' : pctChange < 0 ? 'DOWN' : 'UNCHANGED';

    banner(`${label} -- Supply ${arrow}`);
    console.log(`  Before:  ${formatTokenAmount(oldSupply)} BAMPL`);
    console.log(`  After:   ${formatTokenAmount(newSupply)} BAMPL`);
    console.log(`  Change:  ${sign}${pctChange.toFixed(4)}%`);
    console.log('');
}

// ---------------------------------------------------------------------------
// Menu Actions
// ---------------------------------------------------------------------------

async function actionPostPrice(price: number): Promise<void> {
    const ok = await postPrice(price);
    if (ok) {
        console.log(`  Oracle price set to ${price} MOTO`);
        await showState();
    }
}

async function actionCustomPrice(rl: readline.Interface): Promise<void> {
    const answer = await question(rl, '  Enter price in MOTO (e.g. 1.25): ');
    const price = parseFloat(answer);
    if (isNaN(price) || price <= 0) {
        console.log('  Invalid price. Must be a positive number.');
        return;
    }
    await actionPostPrice(price);
}

async function actionRebase(): Promise<void> {
    const result = await triggerRebase();
    if (result) {
        if (result.oldSupply === result.newSupply) {
            banner('REBASE: No Change');
            console.log('  Supply unchanged -- price is within the rebase threshold.');
            console.log(`  Current supply: ${formatTokenAmount(result.newSupply)} BAMPL`);
        } else if (result.newSupply > result.oldSupply) {
            printRebaseResult('EXPANSION', result.oldSupply, result.newSupply);
        } else {
            printRebaseResult('CONTRACTION', result.oldSupply, result.newSupply);
        }
    }
}

async function actionDemoMode(): Promise<void> {
    const ok = await enableDemoMode(1);
    if (ok) {
        console.log('  Demo mode enabled! Epochs now last 1 block.');
    }
}

async function actionAutoDemo(): Promise<void> {
    banner('AUTO-DEMO SEQUENCE STARTING');
    console.log('  This will run a complete expansion/contraction/equilibrium cycle.');
    console.log('  Sit back and watch the supply dance.\n');

    // Step 1: Enable demo mode
    console.log('  [Step 1/7] Enabling demo mode (1-block epochs)...');
    const demoOk = await enableDemoMode(1);
    if (!demoOk) {
        console.log('  WARNING: enableDemoMode may have failed. Continuing anyway...');
    }
    await sleep(5000);

    // Step 2: Post expansion price
    console.log('  [Step 2/7] Posting expansion price: 1.5 MOTO...');
    const priceOk1 = await postPrice(1.5);
    if (!priceOk1) {
        console.error('  ERROR: Failed to post price. Aborting auto-demo.');
        return;
    }
    await sleep(5000); // Let block mine

    // Step 3: Trigger expansion rebase
    console.log('  [Step 3/7] Triggering EXPANSION rebase...');
    const expansion = await triggerRebase();
    if (expansion) {
        printRebaseResult('EXPANSION', expansion.oldSupply, expansion.newSupply);
    }
    await sleep(10000);

    // Step 4: Post contraction price
    console.log('  [Step 4/7] Posting contraction price: 0.7 MOTO...');
    const priceOk2 = await postPrice(0.7);
    if (!priceOk2) {
        console.error('  ERROR: Failed to post price. Aborting auto-demo.');
        return;
    }
    await sleep(5000);

    // Step 5: Trigger contraction rebase
    console.log('  [Step 5/7] Triggering CONTRACTION rebase...');
    const contraction = await triggerRebase();
    if (contraction) {
        printRebaseResult('CONTRACTION', contraction.oldSupply, contraction.newSupply);
    }
    await sleep(10000);

    // Step 6: Post equilibrium price (within threshold)
    console.log('  [Step 6/7] Posting equilibrium price: 1.02 MOTO (within 5% threshold)...');
    const priceOk3 = await postPrice(1.02);
    if (!priceOk3) {
        console.error('  ERROR: Failed to post price. Continuing...');
    }
    await sleep(5000);

    // Step 7: Trigger equilibrium rebase (should be no-op)
    console.log('  [Step 7/7] Triggering equilibrium rebase (expect no change)...');
    const equilibrium = await triggerRebase();
    if (equilibrium) {
        if (equilibrium.oldSupply === equilibrium.newSupply) {
            banner('EQUILIBRIUM: No Change (within 5% threshold)');
            console.log('  The rebase correctly identified the price is within threshold.');
            console.log(`  Supply remains: ${formatTokenAmount(equilibrium.newSupply)} BAMPL`);
        } else {
            printRebaseResult('UNEXPECTED REBASE', equilibrium.oldSupply, equilibrium.newSupply);
        }
    }

    // Summary
    banner('AUTO-DEMO COMPLETE');
    console.log('  The full elastic supply cycle has been demonstrated:');
    console.log('    1. EXPANSION:    Price > target --> supply increased');
    console.log('    2. CONTRACTION:  Price < target --> supply decreased');
    console.log('    3. EQUILIBRIUM:  Price ~ target --> no supply change');
    console.log('');

    await showState();
}

// ---------------------------------------------------------------------------
// CLI Menu
// ---------------------------------------------------------------------------

function question(rl: readline.Interface, prompt: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => resolve(answer.trim()));
    });
}

async function printMenu(): Promise<void> {
    let stateInfo = '';
    try {
        const state = await getState();
        const priceStr = formatPrice(state.currentPrice);
        const supplyStr = formatTokenAmount(state.totalSupply);
        const epochStr = state.epoch.toString();
        stateInfo = [
            `  Current Oracle Price: ${priceStr} MOTO`,
            `  Current Epoch:        ${epochStr}`,
            `  Current Supply:       ${supplyStr} BAMPL`,
        ].join('\n');
    } catch {
        stateInfo = '  (Unable to fetch state -- contract may not be initialized)';
    }

    console.log('');
    console.log('  ========================================');
    console.log('       BAMPL Demo Controller');
    console.log('  ========================================');
    console.log(stateInfo);
    console.log('');
    console.log('  Commands:');
    console.log('    [1] Post price: 1.5 MOTO (expansion trigger)');
    console.log('    [2] Post price: 0.7 MOTO (contraction trigger)');
    console.log('    [3] Post price: 1.0 MOTO (equilibrium)');
    console.log('    [4] Post custom price');
    console.log('    [5] Enable demo mode (1-block epochs)');
    console.log('    [6] Trigger rebase');
    console.log('    [7] Show current state');
    console.log('    [8] Run auto-demo sequence');
    console.log('    [q] Quit');
    console.log('');
}

async function runMenu(): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    let running = true;

    while (running) {
        await printMenu();

        const choice = await question(rl, '  Select option > ');

        try {
            switch (choice) {
                case '1':
                    await actionPostPrice(1.5);
                    break;

                case '2':
                    await actionPostPrice(0.7);
                    break;

                case '3':
                    await actionPostPrice(1.0);
                    break;

                case '4':
                    await actionCustomPrice(rl);
                    break;

                case '5':
                    await actionDemoMode();
                    break;

                case '6':
                    await actionRebase();
                    break;

                case '7':
                    await showState();
                    break;

                case '8':
                    await actionAutoDemo();
                    break;

                case 'q':
                case 'Q':
                case 'quit':
                case 'exit':
                    running = false;
                    break;

                default:
                    console.log('  Unknown option. Try again.');
            }
        } catch (err) {
            console.error('\n  ERROR executing command:');
            console.error(`  ${err instanceof Error ? err.message : String(err)}`);

            // Try to extract revert data
            if (err && typeof err === 'object' && 'revert' in err) {
                const revertMsg = (err as { revert: string }).revert;
                try {
                    const decoded = Buffer.from(revertMsg, 'base64').toString('utf-8');
                    console.error(`  Revert: ${decoded}`);
                } catch {
                    console.error(`  Revert (raw): ${revertMsg}`);
                }
            }

            console.log('  Press Enter to continue...');
            await question(rl, '');
        }
    }

    rl.close();
    console.log('\n  Goodbye. BAMPL to the moon.\n');
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function initialize(): Promise<void> {
    banner('BAMPL Demo Controller -- Initializing');

    // Validate config
    if (!BAMPL_ADDRESS || BAMPL_ADDRESS === '0x_PLACEHOLDER') {
        console.error('ERROR: BAMPL_CONTRACT_ADDRESS is not set in .env');
        console.error('  Deploy the contract first: npx tsx deploy.ts');
        process.exit(1);
    }

    const hasMnemonic = !!process.env.DEPLOYER_MNEMONIC;
    const hasWif = !!DEPLOYER_WIF && DEPLOYER_WIF !== 'your_wif_key_here';

    if (!hasMnemonic && !hasWif) {
        console.error('ERROR: No wallet credentials found in .env');
        console.error('  Set either DEPLOYER_MNEMONIC or (DEPLOYER_WIF + DEPLOYER_QUANTUM_KEY).');
        process.exit(1);
    }

    // Set up wallet
    const mnemonicPhrase = process.env.DEPLOYER_MNEMONIC;
    if (mnemonicPhrase) {
        console.log('  Using mnemonic-based wallet derivation...');
        const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK);
        wallet = mnemonic.derive(0);
    } else {
        const quantumPrivateKeyHex = process.env.DEPLOYER_QUANTUM_KEY;
        if (!quantumPrivateKeyHex) {
            console.error('ERROR: Need DEPLOYER_QUANTUM_KEY or DEPLOYER_MNEMONIC in .env');
            process.exit(1);
        }
        wallet = Wallet.fromWif(DEPLOYER_WIF, quantumPrivateKeyHex, NETWORK);
    }

    console.log(`  Wallet address: ${wallet.p2tr}`);

    // Set up provider
    provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Set up BAMPL contract
    const contractAddress = Address.fromString(BAMPL_ADDRESS);

    // TODO: If the BAMPL contract ABI differs from what is defined above,
    // update BAMPL_ABI at the top of this file.
    bampl = getContract<IBAMPLContract>(
        contractAddress,
        BAMPL_ABI,
        provider,
        NETWORK,
        wallet.address,
    ) as unknown as IBAMPLContract;

    console.log(`  Contract: ${BAMPL_ADDRESS}`);

    // Test connection by fetching state
    try {
        await showState();
        console.log('  Connection OK. Ready for demo!\n');
    } catch (err) {
        console.warn('  WARNING: Could not fetch initial state.');
        console.warn('  The contract may not be fully initialized yet.');
        console.warn(`  Error: ${err instanceof Error ? err.message : String(err)}`);
        console.log('');
    }
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    await initialize();
    await runMenu();

    // Clean up
    wallet.zeroize();
}

main().catch((err) => {
    console.error('\nFATAL ERROR:\n');
    console.error(err);
    process.exit(1);
});
