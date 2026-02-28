/**
 * BAMPL/MOTO Liquidity Pool Creation Script
 *
 * Creates a liquidity pool on MotoSwap for BAMPL/MOTO trading.
 * This script:
 *   1. Approves BAMPL tokens to the MotoSwap Router
 *   2. Approves MOTO tokens to the MotoSwap Router
 *   3. Calls addLiquidity on the Router
 *
 * Usage:
 *   1. Set all addresses in .env (BAMPL, MOTO, Router)
 *   2. Ensure you have both BAMPL and MOTO tokens in your wallet
 *   3. Run: npx tsx create-pool.ts
 *
 * Prerequisites:
 *   - BAMPL contract deployed and address in .env
 *   - MOTO tokens available in deployer wallet
 *   - MotoSwap Router address configured
 */

import 'dotenv/config';

import {
    getContract,
    JSONRpcProvider,
    OP_20_ABI,
    MOTOSWAP_ROUTER_ABI,
    type IOP20Contract,
    type IMotoswapRouterContract,
} from 'opnet';
import {
    Mnemonic,
    Wallet,
    Address,
    type TransactionParameters,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const DEPLOYER_WIF = process.env.DEPLOYER_WIF;

// Contract addresses from .env
const BAMPL_ADDRESS = process.env.BAMPL_CONTRACT_ADDRESS;
const MOTO_ADDRESS = process.env.MOTO_CONTRACT_ADDRESS;
const ROUTER_ADDRESS = process.env.MOTOSWAP_ROUTER_ADDRESS;

// Liquidity amounts (adjust these for your pool)
const BAMPL_DECIMALS = 8;
const MOTO_DECIMALS = 8;
const ONE_BAMPL = 10n ** BigInt(BAMPL_DECIMALS);
const ONE_MOTO = 10n ** BigInt(MOTO_DECIMALS);

// Pool creation parameters
// Starting with 10,000 BAMPL and 10,000 MOTO (1:1 price ratio)
const BAMPL_LIQUIDITY = 10_000n * ONE_BAMPL; // 10,000 BAMPL
const MOTO_LIQUIDITY = 10_000n * ONE_MOTO;   // 10,000 MOTO

// Slippage tolerance: 2%
const SLIPPAGE_PERCENT = 2;

// Transaction parameters
const MAX_SAT_TO_SPEND = 50_000n;
const FEE_RATE = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function banner(text: string): void {
    const line = '='.repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${text}`);
    console.log(`${line}\n`);
}

function formatTokenAmount(raw: bigint, decimals: number, symbol: string): string {
    const unit = 10n ** BigInt(decimals);
    const whole = raw / unit;
    const frac = raw % unit;
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    const numStr = fracStr.length === 0 ? whole.toLocaleString() : `${whole.toLocaleString()}.${fracStr}`;
    return `${numStr} ${symbol}`;
}

function calculateMinAmount(amount: bigint, slippagePercent: number): bigint {
    const slippageBps = BigInt(Math.floor(slippagePercent * 100)); // Convert to basis points
    return amount - (amount * slippageBps / 10_000n);
}

function getTransactionParams(wallet: Wallet): TransactionParameters {
    return {
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        feeRate: FEE_RATE,
        network: NETWORK,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };
}

/**
 * Simulate a contract call and send if simulation succeeds.
 */
async function simulateAndSend(
    simulation: any,
    label: string,
    wallet: Wallet,
): Promise<any> {
    if (simulation.revert) {
        let revertMsg = simulation.revert;
        try {
            const decoded = Buffer.from(revertMsg, 'base64').toString('utf-8');
            if (decoded.length > 0 && decoded.length < 500) {
                revertMsg = decoded;
            }
        } catch {
            // keep original
        }
        throw new Error(`Simulation reverted for "${label}": ${revertMsg}`);
    }

    if (simulation.estimatedGas) {
        console.log(`  Estimated gas for ${label}: ${simulation.estimatedGas}`);
    }

    console.log(`  Sending transaction for "${label}"...`);
    const receipt = await simulation.sendTransaction(getTransactionParams(wallet));
    console.log(`  TX sent: ${receipt.transactionId ?? 'pending'}`);

    return receipt;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    banner('BAMPL/MOTO Pool Creation -- MotoSwap');

    // -----------------------------------------------------------------------
    // 1. Validate environment
    // -----------------------------------------------------------------------
    const hasMnemonic = !!process.env.DEPLOYER_MNEMONIC;
    const hasWif = !!DEPLOYER_WIF && DEPLOYER_WIF !== 'your_wif_key_here';

    if (!hasMnemonic && !hasWif) {
        console.error('ERROR: No wallet credentials found in .env');
        console.error('  Set either DEPLOYER_MNEMONIC or (DEPLOYER_WIF + DEPLOYER_QUANTUM_KEY).');
        process.exit(1);
    }

    if (!BAMPL_ADDRESS || BAMPL_ADDRESS === '0x_PLACEHOLDER') {
        console.error('ERROR: BAMPL_CONTRACT_ADDRESS is not set in .env');
        console.error('  Deploy the BAMPL contract first: npx tsx deploy.ts');
        process.exit(1);
    }

    if (!MOTO_ADDRESS || MOTO_ADDRESS === '0x_PLACEHOLDER') {
        console.error('ERROR: MOTO_CONTRACT_ADDRESS is not set in .env');
        console.error('  Set the MOTO token contract address in .env');
        // TODO: Look up the actual MOTO testnet address from OPNet docs
        // or use: opnet_contract_addresses(network="testnet", contract="moto")
        process.exit(1);
    }

    if (!ROUTER_ADDRESS || ROUTER_ADDRESS === '0x_PLACEHOLDER') {
        console.error('ERROR: MOTOSWAP_ROUTER_ADDRESS is not set in .env');
        console.error('  Set the MotoSwap Router address in .env');
        // TODO: Look up the actual MotoSwap Router testnet address
        // Regtest router: 0x80f8375d061d638a0b45a4eb4decbfd39e9abba913f464787194ce3c02d2ea5a
        process.exit(1);
    }

    // -----------------------------------------------------------------------
    // 2. Set up wallet
    // -----------------------------------------------------------------------
    let wallet: Wallet;

    const mnemonicPhrase = process.env.DEPLOYER_MNEMONIC;
    if (mnemonicPhrase) {
        console.log('Using mnemonic-based wallet derivation...');
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

    console.log(`Wallet address: ${wallet.p2tr}`);

    // -----------------------------------------------------------------------
    // 3. Set up providers and contracts
    // -----------------------------------------------------------------------
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    const bamplAddress = Address.fromString(BAMPL_ADDRESS);
    const motoAddress = Address.fromString(MOTO_ADDRESS);
    const routerAddress = Address.fromString(ROUTER_ADDRESS);

    const bamplToken = getContract<IOP20Contract>(
        bamplAddress,
        OP_20_ABI,
        provider,
        NETWORK,
        wallet.address,
    );

    const motoToken = getContract<IOP20Contract>(
        motoAddress,
        OP_20_ABI,
        provider,
        NETWORK,
        wallet.address,
    );

    const router = getContract<IMotoswapRouterContract>(
        routerAddress,
        MOTOSWAP_ROUTER_ABI,
        provider,
        NETWORK,
        wallet.address,
    );

    // -----------------------------------------------------------------------
    // 4. Check balances
    // -----------------------------------------------------------------------
    console.log('\nChecking token balances...');

    const [bamplBalResult, motoBalResult] = await Promise.all([
        bamplToken.balanceOf(wallet.address),
        motoToken.balanceOf(wallet.address),
    ]);

    const bamplBalance = bamplBalResult?.properties?.balance ?? 0n;
    const motoBalance = motoBalResult?.properties?.balance ?? 0n;

    console.log(`  BAMPL balance: ${formatTokenAmount(bamplBalance, BAMPL_DECIMALS, 'BAMPL')}`);
    console.log(`  MOTO balance:  ${formatTokenAmount(motoBalance, MOTO_DECIMALS, 'MOTO')}`);

    if (bamplBalance < BAMPL_LIQUIDITY) {
        console.error(`\nERROR: Insufficient BAMPL balance.`);
        console.error(`  Need:  ${formatTokenAmount(BAMPL_LIQUIDITY, BAMPL_DECIMALS, 'BAMPL')}`);
        console.error(`  Have:  ${formatTokenAmount(bamplBalance, BAMPL_DECIMALS, 'BAMPL')}`);
        process.exit(1);
    }

    if (motoBalance < MOTO_LIQUIDITY) {
        console.error(`\nERROR: Insufficient MOTO balance.`);
        console.error(`  Need:  ${formatTokenAmount(MOTO_LIQUIDITY, MOTO_DECIMALS, 'MOTO')}`);
        console.error(`  Have:  ${formatTokenAmount(motoBalance, MOTO_DECIMALS, 'MOTO')}`);
        process.exit(1);
    }

    // -----------------------------------------------------------------------
    // 5. Approve BAMPL to Router
    // -----------------------------------------------------------------------
    banner('Step 1: Approve BAMPL to MotoSwap Router');

    console.log(`  Approving ${formatTokenAmount(BAMPL_LIQUIDITY, BAMPL_DECIMALS, 'BAMPL')} to Router...`);

    // TODO: The method might be `approve` or `increaseAllowance` depending on
    // which is preferred. increaseAllowance is safer against race conditions.
    // The official OPNet docs show increaseAllowance for liquidity additions.
    const approveBamplSim = await bamplToken.increaseAllowance(routerAddress, BAMPL_LIQUIDITY);
    await simulateAndSend(approveBamplSim, 'BAMPL increaseAllowance', wallet);

    console.log('  BAMPL approved.\n');

    // Brief wait between transactions
    console.log('  Waiting 5 seconds for confirmation...');
    await new Promise((r) => setTimeout(r, 5000));

    // -----------------------------------------------------------------------
    // 6. Approve MOTO to Router
    // -----------------------------------------------------------------------
    banner('Step 2: Approve MOTO to MotoSwap Router');

    console.log(`  Approving ${formatTokenAmount(MOTO_LIQUIDITY, MOTO_DECIMALS, 'MOTO')} to Router...`);

    const approveMotoSim = await motoToken.increaseAllowance(routerAddress, MOTO_LIQUIDITY);
    await simulateAndSend(approveMotoSim, 'MOTO increaseAllowance', wallet);

    console.log('  MOTO approved.\n');

    console.log('  Waiting 5 seconds for confirmation...');
    await new Promise((r) => setTimeout(r, 5000));

    // -----------------------------------------------------------------------
    // 7. Add Liquidity
    // -----------------------------------------------------------------------
    banner('Step 3: Add Liquidity');

    const bamplMin = calculateMinAmount(BAMPL_LIQUIDITY, SLIPPAGE_PERCENT);
    const motoMin = calculateMinAmount(MOTO_LIQUIDITY, SLIPPAGE_PERCENT);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min deadline

    console.log('  Pool Parameters:');
    console.log(`    Token A (BAMPL):  ${formatTokenAmount(BAMPL_LIQUIDITY, BAMPL_DECIMALS, 'BAMPL')}`);
    console.log(`    Token B (MOTO):   ${formatTokenAmount(MOTO_LIQUIDITY, MOTO_DECIMALS, 'MOTO')}`);
    console.log(`    Min BAMPL:        ${formatTokenAmount(bamplMin, BAMPL_DECIMALS, 'BAMPL')} (${SLIPPAGE_PERCENT}% slippage)`);
    console.log(`    Min MOTO:         ${formatTokenAmount(motoMin, MOTO_DECIMALS, 'MOTO')} (${SLIPPAGE_PERCENT}% slippage)`);
    console.log(`    Deadline:         ${new Date(Number(deadline) * 1000).toISOString()}`);
    console.log('');

    // TODO: The addLiquidity method signature is:
    //   addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline)
    // Verify this matches the actual MotoSwap Router contract interface.
    const addLiqSim = await router.addLiquidity(
        bamplAddress,       // tokenA
        motoAddress,        // tokenB
        BAMPL_LIQUIDITY,    // amountADesired
        MOTO_LIQUIDITY,     // amountBDesired
        bamplMin,           // amountAMin
        motoMin,            // amountBMin
        wallet.address,     // to (LP tokens recipient)
        deadline,           // deadline
    );

    // Log simulation results
    if (addLiqSim.properties) {
        const props = addLiqSim.properties as Record<string, bigint>;
        if (props.amountA !== undefined) {
            console.log(`  Simulated amountA: ${formatTokenAmount(props.amountA, BAMPL_DECIMALS, 'BAMPL')}`);
        }
        if (props.amountB !== undefined) {
            console.log(`  Simulated amountB: ${formatTokenAmount(props.amountB, MOTO_DECIMALS, 'MOTO')}`);
        }
        if (props.liquidity !== undefined) {
            console.log(`  LP tokens:         ${props.liquidity}`);
        }
    }

    // Use higher spend limit for liquidity addition
    const addLiqParams = {
        ...getTransactionParams(wallet),
        maximumAllowedSatToSpend: 100_000n, // Higher for pool creation
    };

    if (addLiqSim.revert) {
        let revertMsg = addLiqSim.revert;
        try {
            const decoded = Buffer.from(revertMsg, 'base64').toString('utf-8');
            if (decoded.length > 0 && decoded.length < 500) {
                revertMsg = decoded;
            }
        } catch {
            // keep original
        }
        console.error(`\n  ERROR: addLiquidity simulation reverted: ${revertMsg}`);
        process.exit(1);
    }

    console.log('  Simulation OK. Sending addLiquidity transaction...');

    if (addLiqSim.estimatedGas) {
        console.log(`  Estimated gas: ${addLiqSim.estimatedGas}`);
    }

    const receipt = await addLiqSim.sendTransaction(addLiqParams);
    console.log(`  TX sent: ${receipt.transactionId ?? 'pending'}`);

    // -----------------------------------------------------------------------
    // 8. Success
    // -----------------------------------------------------------------------
    banner('POOL CREATION SUCCESSFUL');

    console.log('  BAMPL/MOTO liquidity pool has been created on MotoSwap!');
    console.log('');
    console.log(`  BAMPL provided: ${formatTokenAmount(BAMPL_LIQUIDITY, BAMPL_DECIMALS, 'BAMPL')}`);
    console.log(`  MOTO provided:  ${formatTokenAmount(MOTO_LIQUIDITY, MOTO_DECIMALS, 'MOTO')}`);
    console.log(`  Initial price:  1 BAMPL = 1 MOTO`);
    console.log('');
    console.log('  NEXT STEPS:');
    console.log('  -----------');
    console.log('  1. Verify the pool on MotoSwap: https://motoswap.org/pool');
    console.log('  2. Users can now swap BAMPL/MOTO on MotoSwap');
    console.log('  3. Run the demo to show elastic supply in action:');
    console.log('     npx tsx demo.ts');
    console.log('');

    // Clean up
    wallet.zeroize();
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

main().catch((err) => {
    console.error('\nFATAL ERROR during pool creation:\n');
    console.error(err);

    if (err && typeof err === 'object' && 'revert' in err) {
        const revertMsg = (err as { revert: string }).revert;
        try {
            const decoded = Buffer.from(revertMsg, 'base64').toString('utf-8');
            console.error(`\nRevert message: ${decoded}`);
        } catch {
            console.error(`\nRevert (raw): ${revertMsg}`);
        }
    }

    process.exit(1);
});
