import { useState, useCallback } from 'react';
import { formatBAMPL } from '../utils/formatters';
import { BAMPL_DECIMALS } from '../config/addresses';

export interface AdminPanelProps {
    currentPrice: bigint;
    targetPrice: bigint;
    epochLength: bigint;
    rebaseLag: bigint;
    deviationThreshold: bigint;
    onPostPrice: (price: bigint) => Promise<unknown>;
    onEnableDemoMode: () => Promise<unknown>;
    onSetEpochLength: (length: bigint) => Promise<unknown>;
}

/**
 * Admin / deployer-only control panel.
 *
 * Provides oracle price posting, quick price multiplier buttons,
 * epoch length configuration, and demo mode activation.
 */
export function AdminPanel({
    currentPrice,
    targetPrice,
    epochLength,
    rebaseLag,
    deviationThreshold,
    onPostPrice,
    onEnableDemoMode,
    onSetEpochLength,
}: AdminPanelProps) {
    const [priceInput, setPriceInput] = useState('');
    const [epochInput, setEpochInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

    const showFeedback = (msg: string, ok: boolean) => {
        setFeedback({ msg, ok });
        setTimeout(() => setFeedback(null), 4000);
    };

    const wrap = async (action: () => Promise<unknown>, label: string) => {
        setBusy(true);
        setFeedback(null);
        try {
            await action();
            showFeedback(`${label} submitted`, true);
        } catch (err: unknown) {
            showFeedback(
                err instanceof Error ? err.message : String(err),
                false,
            );
        } finally {
            setBusy(false);
        }
    };

    // Post raw price
    const handlePostPrice = useCallback(() => {
        const num = parseFloat(priceInput);
        if (isNaN(num) || num <= 0) {
            showFeedback('Enter a valid positive number', false);
            return;
        }
        const raw = BigInt(Math.round(num * 10 ** BAMPL_DECIMALS));
        return wrap(() => onPostPrice(raw), 'Price');
    }, [priceInput, onPostPrice]);

    // Quick multiplier buttons
    const postMultiplier = (mult: number) => {
        if (targetPrice === 0n) return;
        const raw = BigInt(Math.round(Number(targetPrice) * mult));
        return wrap(() => onPostPrice(raw), `Price (${mult}x)`);
    };

    // Set epoch length
    const handleSetEpochLength = useCallback(() => {
        const num = parseInt(epochInput, 10);
        if (isNaN(num) || num <= 0) {
            showFeedback('Enter a valid positive integer', false);
            return;
        }
        return wrap(() => onSetEpochLength(BigInt(num)), 'Epoch length');
    }, [epochInput, onSetEpochLength]);

    // Enable demo mode
    const handleDemoMode = () => {
        return wrap(() => onEnableDemoMode(), 'Demo mode');
    };

    return (
        <div className="glass-card glass-card--glow-purple admin-panel">
            <div className="admin-panel__title">
                <div className="admin-panel__title-icon" />
                Admin Controls
            </div>
            <div className="admin-panel__subtitle">
                Deployer-only operations. These calls will revert if you are not the contract owner.
            </div>

            {/* ------- Post Price ------- */}
            <div className="admin-panel__section">
                <div className="admin-panel__section-label">Post Oracle Price (BAMPL/MOTO)</div>
                <div className="admin-panel__input-row">
                    <input
                        className="input"
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 1.25"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        disabled={busy}
                    />
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={handlePostPrice}
                        disabled={busy}
                    >
                        Post
                    </button>
                </div>

                <div className="admin-panel__quick-buttons">
                    {[0.5, 0.8, 1.0, 1.2, 1.5, 2.0].map((m) => (
                        <button
                            key={m}
                            className="btn btn--secondary btn--sm"
                            onClick={() => postMultiplier(m)}
                            disabled={busy}
                        >
                            {m}x
                        </button>
                    ))}
                </div>
            </div>

            {/* ------- Epoch Length ------- */}
            <div className="admin-panel__section">
                <div className="admin-panel__section-label">Set Epoch Length (blocks)</div>
                <div className="admin-panel__input-row">
                    <input
                        className="input"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 10"
                        value={epochInput}
                        onChange={(e) => setEpochInput(e.target.value)}
                        disabled={busy}
                    />
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={handleSetEpochLength}
                        disabled={busy}
                    >
                        Set
                    </button>
                </div>
            </div>

            {/* ------- Demo Mode ------- */}
            <div className="admin-panel__section">
                <div className="admin-panel__section-label">Demo Mode</div>
                <button
                    className="btn btn--danger btn--sm"
                    onClick={handleDemoMode}
                    disabled={busy}
                >
                    {busy ? 'Sending...' : 'Enable Demo Mode (1-block epochs)'}
                </button>
            </div>

            {/* ------- Current Config Info ------- */}
            <div className="admin-panel__section" style={{ marginTop: 8 }}>
                <div className="admin-panel__section-label">Current Configuration</div>

                <div className="admin-panel__info-row">
                    <span className="admin-panel__info-label">Oracle Price</span>
                    <span className="admin-panel__info-value">{formatBAMPL(currentPrice, 4)}</span>
                </div>
                <div className="admin-panel__info-row">
                    <span className="admin-panel__info-label">Target Price</span>
                    <span className="admin-panel__info-value">{formatBAMPL(targetPrice, 4)}</span>
                </div>
                <div className="admin-panel__info-row">
                    <span className="admin-panel__info-label">Epoch Length</span>
                    <span className="admin-panel__info-value">{epochLength.toString()} blocks</span>
                </div>
                <div className="admin-panel__info-row">
                    <span className="admin-panel__info-label">Rebase Lag</span>
                    <span className="admin-panel__info-value">{rebaseLag.toString()}</span>
                </div>
                <div className="admin-panel__info-row">
                    <span className="admin-panel__info-label">Deviation Threshold</span>
                    <span className="admin-panel__info-value">
                        {deviationThreshold > 0n
                            ? `${((Number(deviationThreshold) / 10 ** BAMPL_DECIMALS) * 100).toFixed(2)}%`
                            : '--'}
                    </span>
                </div>
            </div>

            {/* Feedback */}
            {feedback && (
                <div
                    className={feedback.ok ? 'toast toast--success' : 'toast toast--error'}
                    style={{ position: 'relative', bottom: 'auto', right: 'auto', marginTop: 12 }}
                >
                    {feedback.msg}
                </div>
            )}
        </div>
    );
}
