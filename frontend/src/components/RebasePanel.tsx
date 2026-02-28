import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviationBar } from './DeviationBar';
import { formatBAMPL, computeDeviation } from '../utils/formatters';
import { drawSparkline } from '../utils/sparkline';
import { BAMPL_DECIMALS } from '../config/addresses';

export interface RebasePanelProps {
    currentPrice: bigint;
    targetPrice: bigint;
    totalSupply: bigint;
    canRebase: boolean;
    deviationThreshold: bigint;
    rebaseLag: bigint;
    currentEpoch: bigint;
    nextRebaseBlock: bigint;
    loading: boolean;
    supplyHistory: number[];
    onTriggerRebase: () => Promise<unknown>;
}

/**
 * Main rebase visualisation panel.
 *
 * Shows current and target prices, the deviation bar, supply-delta preview,
 * a rebase trigger button, and a sparkline of supply history.
 */
export function RebasePanel({
    currentPrice,
    targetPrice,
    totalSupply,
    canRebase,
    deviationThreshold,
    rebaseLag,
    currentEpoch,
    nextRebaseBlock,
    loading,
    supplyHistory,
    onTriggerRebase,
}: RebasePanelProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [rebasing, setRebasing] = useState(false);
    const [txError, setTxError] = useState<string | null>(null);

    // Compute deviation
    const deviation = computeDeviation(currentPrice, targetPrice);
    const thresholdFrac =
        deviationThreshold > 0n
            ? Number(deviationThreshold) / 10 ** BAMPL_DECIMALS
            : 0.05;

    // Status label
    const isExpansion = deviation > thresholdFrac;
    const isContraction = deviation < -thresholdFrac;
    const statusLabel = isExpansion
        ? 'Expansion'
        : isContraction
          ? 'Contraction'
          : 'Equilibrium (within threshold)';
    const statusClass = isExpansion
        ? 'rebase-panel__status--expansion'
        : isContraction
          ? 'rebase-panel__status--contraction'
          : 'rebase-panel__status--equilibrium';

    // Supply delta preview
    const supplyDeltaPreview = useCallback((): string => {
        if (targetPrice === 0n || rebaseLag === 0n) return '--';
        const supplyNum = Number(totalSupply) / 10 ** BAMPL_DECIMALS;
        const lag = Number(rebaseLag);
        const delta = (supplyNum * deviation) / lag;
        if (Math.abs(delta) < 0.0001) return '~0 BAMPL';
        const sign = delta > 0 ? '+' : '';
        return `${sign}${delta.toFixed(4)} BAMPL`;
    }, [totalSupply, deviation, rebaseLag, targetPrice]);

    // Rebase handler
    const handleRebase = async () => {
        setRebasing(true);
        setTxError(null);
        try {
            await onTriggerRebase();
        } catch (err: unknown) {
            setTxError(err instanceof Error ? err.message : String(err));
        } finally {
            setRebasing(false);
        }
    };

    // Sparkline drawing
    useEffect(() => {
        if (!canvasRef.current || supplyHistory.length < 2) return;

        const lineColor = isExpansion
            ? '#00F0A0'
            : isContraction
              ? '#FF4466'
              : '#5A5A6E';

        drawSparkline(canvasRef.current, supplyHistory, {
            lineColor,
            fillColorTop: isExpansion
                ? 'rgba(0, 240, 160, 0.20)'
                : isContraction
                  ? 'rgba(255, 68, 102, 0.20)'
                  : 'rgba(255, 255, 255, 0.05)',
            fillColorBottom: 'transparent',
        });
    }, [supplyHistory, isExpansion, isContraction]);

    if (loading) {
        return (
            <div className="glass-card rebase-panel">
                <div className="rebase-panel__title">
                    <div className="rebase-panel__title-icon" />
                    Rebase
                </div>
                <div className="skeleton" style={{ height: 160 }} />
            </div>
        );
    }

    return (
        <div className="glass-card glass-card--glow-green rebase-panel">
            <div className="rebase-panel__title">
                <div className="rebase-panel__title-icon" />
                Rebase
            </div>

            {/* Price display */}
            <div className="rebase-panel__prices">
                <div className="rebase-panel__price-block">
                    <div className="rebase-panel__price-label">Current Price</div>
                    <div
                        className="rebase-panel__price-value"
                        style={{
                            color: isExpansion
                                ? 'var(--accent-green)'
                                : isContraction
                                  ? 'var(--accent-red)'
                                  : 'var(--text-primary)',
                        }}
                    >
                        {formatBAMPL(currentPrice, 4)}
                    </div>
                </div>
                <div className="rebase-panel__price-block">
                    <div className="rebase-panel__price-label">Target Price</div>
                    <div className="rebase-panel__price-value" style={{ color: 'var(--text-secondary)' }}>
                        {formatBAMPL(targetPrice, 4)}
                    </div>
                </div>
            </div>

            {/* Status badge */}
            <div className={`rebase-panel__status ${statusClass}`}>
                <span className="rebase-panel__status-dot" />
                {statusLabel}
            </div>

            {/* Deviation bar */}
            <DeviationBar deviation={deviation} threshold={thresholdFrac} />

            {/* Supply delta preview */}
            <div className="rebase-panel__supply-delta">
                Supply delta if rebase triggers now:{' '}
                <strong>{supplyDeltaPreview()}</strong>
            </div>

            {/* Actions */}
            <div className="rebase-panel__actions">
                <button
                    className="btn btn--primary btn--lg"
                    disabled={!canRebase || rebasing}
                    onClick={handleRebase}
                >
                    {rebasing ? (
                        <>
                            <span className="spinner" />
                            Rebasing...
                        </>
                    ) : (
                        'Trigger Rebase'
                    )}
                </button>

                {!canRebase && (
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                        Next eligible at block {nextRebaseBlock.toString()}
                    </span>
                )}
            </div>

            {txError && (
                <div className="toast toast--error" style={{ position: 'relative', bottom: 'auto', right: 'auto', marginBottom: 12 }}>
                    {txError}
                </div>
            )}

            {/* Epoch info */}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Epoch {currentEpoch.toString()}
            </div>

            {/* Sparkline */}
            <div className="rebase-panel__sparkline-section">
                <div className="rebase-panel__sparkline-label">Supply History</div>
                <canvas ref={canvasRef} className="rebase-panel__sparkline-canvas" />
                {supplyHistory.length < 2 && (
                    <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>
                        Awaiting rebase data...
                    </div>
                )}
            </div>
        </div>
    );
}
