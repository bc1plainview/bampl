import { useCallback, useEffect, useRef, useState } from 'react';

export interface RebaseRecord {
    /** Monotonically increasing id for React keys */
    id: number;
    /** Unix timestamp (ms) when the change was detected */
    timestamp: number;
    /** Total supply after the change */
    supply: number;
    /** Epoch number at detection time */
    epoch: bigint;
    /** Delta from previous supply (positive = expansion, negative = contraction) */
    delta: number;
}

const MAX_HISTORY = 60;

/**
 * Tracks rebase events by monitoring total supply changes.
 *
 * Since OPNet does not expose an easy event-query API from the frontend,
 * this hook compares the current totalSupply with the previously seen value
 * on each poll cycle. When a change is detected it records a RebaseRecord.
 *
 * The history array is capped at MAX_HISTORY entries (most recent last).
 */
export function useRebaseHistory(totalSupply: bigint, epoch: bigint) {
    const [history, setHistory] = useState<RebaseRecord[]>([]);
    const prevSupplyRef = useRef<bigint | null>(null);
    const idRef = useRef(0);

    const supplyAsNumber = Number(totalSupply) / 1e8;

    useEffect(() => {
        if (totalSupply === 0n) return;

        const prev = prevSupplyRef.current;

        // First observation -- seed the chart with a single point
        if (prev === null) {
            prevSupplyRef.current = totalSupply;
            setHistory([
                {
                    id: idRef.current++,
                    timestamp: Date.now(),
                    supply: supplyAsNumber,
                    epoch,
                    delta: 0,
                },
            ]);
            return;
        }

        // No change
        if (prev === totalSupply) return;

        // Supply changed -- record it
        const prevNum = Number(prev) / 1e8;
        const delta = supplyAsNumber - prevNum;
        prevSupplyRef.current = totalSupply;

        setHistory((h) => {
            const next = [
                ...h,
                {
                    id: idRef.current++,
                    timestamp: Date.now(),
                    supply: supplyAsNumber,
                    epoch,
                    delta,
                },
            ];
            if (next.length > MAX_HISTORY) return next.slice(next.length - MAX_HISTORY);
            return next;
        });
    }, [totalSupply, epoch, supplyAsNumber]);

    /** Manually push a synthetic data point (useful for initialisation) */
    const pushRecord = useCallback(
        (supply: number, ep: bigint) => {
            setHistory((h) => {
                const last = h[h.length - 1];
                const delta = last ? supply - last.supply : 0;
                const next = [
                    ...h,
                    {
                        id: idRef.current++,
                        timestamp: Date.now(),
                        supply,
                        epoch: ep,
                        delta,
                    },
                ];
                if (next.length > MAX_HISTORY) return next.slice(next.length - MAX_HISTORY);
                return next;
            });
        },
        [],
    );

    /** Supply values suitable for direct sparkline rendering */
    const supplyValues = history.map((r) => r.supply);

    return { history, supplyValues, pushRecord };
}
