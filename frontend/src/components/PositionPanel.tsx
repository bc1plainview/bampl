import { useMemo } from 'react';
import { formatBAMPL, computeNetworkShare } from '../utils/formatters';

export interface PositionPanelProps {
    balance: bigint;
    scaledBalance: bigint;
    scaledTotalSupply: bigint;
    totalSupply: bigint;
    loading: boolean;
    /** Last supply delta detected from rebase history (human-readable number) */
    lastDelta: number;
}

/**
 * User position panel.
 *
 * Displays the connected wallet's BAMPL balance, network share percentage,
 * raw gon (scaled) balance, and the last rebase change indicator.
 */
export function PositionPanel({
    balance,
    scaledBalance,
    scaledTotalSupply,
    loading,
    lastDelta,
}: PositionPanelProps) {
    const networkShare = useMemo(
        () => computeNetworkShare(scaledBalance, scaledTotalSupply),
        [scaledBalance, scaledTotalSupply],
    );

    const networkShareDisplay =
        networkShare > 0 ? `${networkShare.toFixed(6)}%` : '0%';

    const deltaSign = lastDelta > 0 ? '+' : lastDelta < 0 ? '' : '';
    const deltaDisplay =
        lastDelta !== 0 ? `${deltaSign}${lastDelta.toFixed(4)} BAMPL` : '--';
    const deltaClass =
        lastDelta > 0
            ? 'position-panel__delta-value--positive'
            : lastDelta < 0
              ? 'position-panel__delta-value--negative'
              : '';

    if (loading) {
        return (
            <div className="glass-card position-panel">
                <div className="position-panel__title">
                    <div className="position-panel__title-icon" />
                    Your Position
                </div>
                <div className="skeleton" style={{ height: 120 }} />
            </div>
        );
    }

    return (
        <div className="glass-card glass-card--glow-blue position-panel">
            <div className="position-panel__title">
                <div className="position-panel__title-icon" />
                Your Position
            </div>

            <div className="position-panel__row">
                <span className="position-panel__row-label">Balance</span>
                <span className="position-panel__row-value">
                    {formatBAMPL(balance)} BAMPL
                </span>
            </div>

            <div className="position-panel__row">
                <span className="position-panel__row-label">Network Share</span>
                <span className="position-panel__row-value">{networkShareDisplay}</span>
            </div>

            <div className="position-panel__row">
                <span className="position-panel__row-label">Gon Balance</span>
                <span className="position-panel__row-value font-mono" style={{ fontSize: '0.75rem' }}>
                    {scaledBalance.toString()}
                </span>
            </div>

            <div className="position-panel__delta">
                Last rebase change:{' '}
                <span className={`position-panel__delta-value ${deltaClass}`}>
                    {deltaDisplay}
                </span>
            </div>
        </div>
    );
}
