import { useMemo } from 'react';
import { BAMPL_DECIMALS } from '../config/addresses';
import { computeNetworkShare } from '../utils/formatters';

interface YourSliceProps {
    balance: bigint;
    totalSupply: bigint;
    scaledBalance: bigint;
    scaledTotalSupply: bigint;
    lastDelta: number;
}

/**
 * Visual "pie slice" representation of the user's position.
 * Shows that while the total supply changes, YOUR percentage stays the same.
 * Uses an SVG donut chart for maximum visual impact.
 */
export function YourSlice({ balance, totalSupply, scaledBalance, scaledTotalSupply, lastDelta }: YourSliceProps) {
    const balanceNum = Number(balance) / 10 ** BAMPL_DECIMALS;
    const supplyNum = Number(totalSupply) / 10 ** BAMPL_DECIMALS;
    const share = useMemo(
        () => computeNetworkShare(scaledBalance, scaledTotalSupply),
        [scaledBalance, scaledTotalSupply],
    );

    // SVG donut chart params
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    // For visual purposes, scale very small shares up so they're visible
    const displayShare = share > 0 ? Math.max(share, 0.5) : 0;
    const strokeLen = (displayShare / 100) * circumference;
    const gapLen = circumference - strokeLen;

    const isExpansion = lastDelta > 0;
    const isContraction = lastDelta < 0;

    return (
        <div className="your-slice">
            <div className="your-slice__header">
                <h3 className="your-slice__title">Your Position</h3>
                <p className="your-slice__subtitle">
                    Your slice of the pie never changes, even when the pie gets bigger or smaller
                </p>
            </div>

            <div className="your-slice__content">
                {/* Donut chart */}
                <div className="your-slice__chart">
                    <svg viewBox="0 0 140 140" className="your-slice__svg">
                        {/* Background ring */}
                        <circle
                            cx="70" cy="70" r={radius}
                            fill="none"
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth="14"
                        />
                        {/* Your share arc */}
                        {displayShare > 0 && (
                            <circle
                                cx="70" cy="70" r={radius}
                                fill="none"
                                stroke="url(#sliceGradient)"
                                strokeWidth="14"
                                strokeDasharray={`${strokeLen} ${gapLen}`}
                                strokeDashoffset={circumference / 4}
                                strokeLinecap="round"
                                className="your-slice__arc"
                            />
                        )}
                        <defs>
                            <linearGradient id="sliceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#8844FF" />
                                <stop offset="100%" stopColor="#00F0A0" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="your-slice__center-text">
                        <span className="your-slice__pct">
                            {share > 0 ? share.toFixed(4) : '0'}
                        </span>
                        <span className="your-slice__pct-sign">%</span>
                    </div>
                </div>

                {/* Stats */}
                <div className="your-slice__stats">
                    <div className="your-slice__stat">
                        <span className="your-slice__stat-label">Your Balance</span>
                        <span className="your-slice__stat-value">
                            {balanceNum > 0
                                ? balanceNum.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : '--'
                            }
                            <span className="your-slice__stat-unit"> BAMPL</span>
                        </span>
                    </div>

                    <div className="your-slice__stat">
                        <span className="your-slice__stat-label">Total Supply</span>
                        <span className="your-slice__stat-value">
                            {supplyNum.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            <span className="your-slice__stat-unit"> BAMPL</span>
                        </span>
                    </div>

                    <div className="your-slice__stat">
                        <span className="your-slice__stat-label">Last Rebase Effect</span>
                        <span className={`your-slice__stat-value ${
                            isExpansion ? 'text-green' : isContraction ? 'text-red' : ''
                        }`}>
                            {lastDelta !== 0
                                ? `${lastDelta > 0 ? '+' : ''}${lastDelta.toLocaleString(undefined, { maximumFractionDigits: 2 })} BAMPL`
                                : 'No rebase yet'
                            }
                        </span>
                    </div>

                    <div className="your-slice__key-insight">
                        Your ownership percentage <strong>never changes</strong> during rebases.
                        Only the number of tokens changes.
                    </div>
                </div>
            </div>
        </div>
    );
}
