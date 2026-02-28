import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from '@btc-vision/transaction';
import { getBAMPLContract } from '../services/ContractService';
import { POLL_INTERVAL_MS, NETWORK } from '../config/addresses';
import { useWallet } from './useWallet';

export interface BAMPLState {
    /** Total circulating supply (raw u256, divide by 10^8 for display) */
    totalSupply: bigint;
    /** Connected wallet BAMPL balance (raw u256) */
    balance: bigint;
    /** Connected wallet scaled (gon) balance */
    scaledBalance: bigint;
    /** Last reported oracle price (raw u256, 8-decimal fixed point) */
    currentPrice: bigint;
    /** Target peg price (raw u256, 8-decimal fixed point) */
    targetPrice: bigint;
    /** Current rebase epoch number */
    currentEpoch: bigint;
    /** Block height at which next rebase becomes eligible */
    nextRebaseBlock: bigint;
    /** Whether a rebase can be triggered right now */
    canRebase: boolean;
    /** Internal gonsPerFragment scalar */
    gonsPerFragment: bigint;
    /** Block height of the last executed rebase */
    lastRebaseBlock: bigint;
    /** Number of blocks per rebase epoch */
    epochLength: bigint;
    /** Rebase lag factor (smoothing denominator) */
    rebaseLag: bigint;
    /** Deviation threshold (percentage as fixed-point) */
    deviationThreshold: bigint;
    /** Scaled total supply (total gons) */
    scaledTotalSupply: bigint;
    /** Loading flag -- true while first fetch is in progress */
    loading: boolean;
    /** Last error message, if any */
    error: string | null;
}

const ZERO = 0n;

const DEFAULT_STATE: BAMPLState = {
    totalSupply: ZERO,
    balance: ZERO,
    scaledBalance: ZERO,
    currentPrice: ZERO,
    targetPrice: ZERO,
    currentEpoch: ZERO,
    nextRebaseBlock: ZERO,
    canRebase: false,
    gonsPerFragment: ZERO,
    lastRebaseBlock: ZERO,
    epochLength: ZERO,
    rebaseLag: ZERO,
    deviationThreshold: ZERO,
    scaledTotalSupply: ZERO,
    loading: true,
    error: null,
};

/**
 * Primary data hook for all BAMPL protocol state.
 *
 * Polls the on-chain contract every POLL_INTERVAL_MS for the latest values.
 * Also exposes `refresh()` to force an immediate re-fetch (e.g. after a tx).
 */
export function useBAMPL() {
    const [state, setState] = useState<BAMPLState>(DEFAULT_STATE);
    const { walletAddress, isConnected, address: walletAddrObj } = useWallet();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchState = useCallback(async () => {
        try {
            const contract = getBAMPLContract();

            // Use the wallet's real Address object (includes MLDSA identity)
            const walletAddr: Address | null = (isConnected && walletAddrObj) ? walletAddrObj : null;

            // Fire all read calls in parallel
            const [
                totalSupplyRes,
                currentPriceRes,
                targetPriceRes,
                currentEpochRes,
                nextRebaseBlockRes,
                canRebaseRes,
                gonsPerFragmentRes,
                lastRebaseBlockRes,
                epochLengthRes,
                rebaseLagRes,
                deviationThresholdRes,
                scaledTotalSupplyRes,
                balanceRes,
                scaledBalanceRes,
            ] = await Promise.all([
                contract.totalSupply().catch(() => null),
                contract.currentPrice().catch(() => null),
                contract.targetPrice().catch(() => null),
                contract.currentEpoch().catch(() => null),
                contract.nextRebaseBlock().catch(() => null),
                contract.canRebase().catch(() => null),
                contract.gonsPerFragment().catch(() => null),
                contract.lastRebaseBlock().catch(() => null),
                contract.epochLength().catch(() => null),
                contract.rebaseLag().catch(() => null),
                contract.deviationThreshold().catch(() => null),
                contract.scaledTotalSupply().catch(() => null),
                walletAddr
                    ? contract.balanceOf(walletAddr).catch(() => null)
                    : Promise.resolve(null),
                walletAddr
                    ? contract.scaledBalanceOf(walletAddr).catch(() => null)
                    : Promise.resolve(null),
            ]);

            setState((prev) => ({
                ...prev,
                totalSupply: totalSupplyRes?.properties?.totalSupply ?? prev.totalSupply,
                currentPrice: currentPriceRes?.properties?.price ?? prev.currentPrice,
                targetPrice: targetPriceRes?.properties?.target ?? prev.targetPrice,
                currentEpoch: currentEpochRes?.properties?.epoch ?? prev.currentEpoch,
                nextRebaseBlock: nextRebaseBlockRes?.properties?.blockHeight ?? prev.nextRebaseBlock,
                canRebase: canRebaseRes?.properties?.allowed ?? prev.canRebase,
                gonsPerFragment: gonsPerFragmentRes?.properties?.gonsPerFragment ?? prev.gonsPerFragment,
                lastRebaseBlock: lastRebaseBlockRes?.properties?.blockHeight ?? prev.lastRebaseBlock,
                epochLength: epochLengthRes?.properties?.length ?? prev.epochLength,
                rebaseLag: rebaseLagRes?.properties?.lag ?? prev.rebaseLag,
                deviationThreshold: deviationThresholdRes?.properties?.threshold ?? prev.deviationThreshold,
                scaledTotalSupply: scaledTotalSupplyRes?.properties?.scaledTotalSupply ?? prev.scaledTotalSupply,
                balance: balanceRes?.properties?.balance ?? (isConnected ? prev.balance : ZERO),
                scaledBalance: scaledBalanceRes?.properties?.scaledBalance ?? (isConnected ? prev.scaledBalance : ZERO),
                loading: false,
                error: null,
            }));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setState((prev) => ({ ...prev, loading: false, error: msg }));
        }
    }, [walletAddress, isConnected, walletAddrObj]);

    /** Trigger a rebase transaction (write call) */
    const triggerRebase = useCallback(async () => {
        if (!walletAddress) throw new Error('Wallet not connected');
        const contract = getBAMPLContract();
        const sim = await contract.rebase();
        if (sim.revert) throw new Error(`Rebase reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: walletAddress,
            maximumAllowedSatToSpend: 100_000n,
            network: NETWORK,
        });
        // Refresh state after successful tx
        await fetchState();
        return receipt;
    }, [walletAddress, fetchState]);

    /** Post an oracle price (admin) */
    const postPrice = useCallback(
        async (price: bigint) => {
            if (!walletAddress) throw new Error('Wallet not connected');
            const contract = getBAMPLContract();
            const sim = await contract.postPrice(price);
            if (sim.revert) throw new Error(`postPrice reverted: ${sim.revert}`);

            const receipt = await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n,
                network: NETWORK,
            });
            await fetchState();
            return receipt;
        },
        [walletAddress, fetchState],
    );

    /** Enable demo mode -- sets epoch length to 1 block (admin) */
    const enableDemoMode = useCallback(async () => {
        if (!walletAddress) throw new Error('Wallet not connected');
        const contract = getBAMPLContract();
        const sim = await contract.enableDemoMode();
        if (sim.revert) throw new Error(`enableDemoMode reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: walletAddress,
            maximumAllowedSatToSpend: 100_000n,
            network: NETWORK,
        });
        await fetchState();
        return receipt;
    }, [walletAddress, fetchState]);

    /** Set epoch length (admin) */
    const setEpochLength = useCallback(
        async (length: bigint) => {
            if (!walletAddress) throw new Error('Wallet not connected');
            const contract = getBAMPLContract();
            const sim = await contract.setEpochLength(length);
            if (sim.revert) throw new Error(`setEpochLength reverted: ${sim.revert}`);

            const receipt = await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n,
                network: NETWORK,
            });
            await fetchState();
            return receipt;
        },
        [walletAddress, fetchState],
    );

    /** Set target price (admin) */
    const setTargetPrice = useCallback(
        async (price: bigint) => {
            if (!walletAddress) throw new Error('Wallet not connected');
            const contract = getBAMPLContract();
            const sim = await contract.setTargetPrice(price);
            if (sim.revert) throw new Error(`setTargetPrice reverted: ${sim.revert}`);

            const receipt = await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n,
                network: NETWORK,
            });
            await fetchState();
            return receipt;
        },
        [walletAddress, fetchState],
    );

    // Polling lifecycle
    useEffect(() => {
        fetchState();
        intervalRef.current = setInterval(fetchState, POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchState]);

    return {
        ...state,
        refresh: fetchState,
        triggerRebase,
        postPrice,
        enableDemoMode,
        setEpochLength,
        setTargetPrice,
    };
}
