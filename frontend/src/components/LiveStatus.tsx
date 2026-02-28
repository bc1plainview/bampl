import { useMemo } from 'react';
import { BAMPL_DECIMALS } from '../config/addresses';

interface LiveStatusProps {
    currentPrice: bigint;
    targetPrice: bigint;
    totalSupply: bigint;
    currentEpoch: bigint;
    rebaseLag: bigint;
    canRebase: boolean;
    deviationThreshold: bigint;
}

/**
 * Giant visual status banner showing exactly what's happening right now
 * in plain English. Designed for people who don't know what elastic supply means.
 */
export function LiveStatus({
    currentPrice,
    targetPrice,
    totalSupply,
    currentEpoch,
    rebaseLag,
    canRebase,
    deviationThreshold,
}: LiveStatusProps) {
    const price = Number(currentPrice) / 10 ** BAMPL_DECIMALS;
    const target = Number(targetPrice) / 10 ** BAMPL_DECIMALS;
    const supply = Number(totalSupply) / 10 ** BAMPL_DECIMALS;
    const lag = Number(rebaseLag);
    const threshold = Number(deviationThreshold) / 10 ** BAMPL_DECIMALS;

    const deviation = target > 0 ? (price - target) / target : 0;
    const isExpansion = deviation > threshold;
    const isContraction = deviation < -threshold;
    const isEquilibrium = !isExpansion && !isContraction;

    const supplyDelta = lag > 0 ? (supply * deviation) / lag : 0;

    const statusConfig = useMemo(() => {
        if (isExpansion) {
            return {
                emoji: '\u2191',
                mode: 'EXPANSION',
                modeClass: 'live-status--expansion',
                headline: 'Supply is Growing',
                explanation: `Price is ${(deviation * 100).toFixed(1)}% above target. When a rebase happens, everyone's wallet balance will increase.`,
                delta: `+${supplyDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })} BAMPL`,
                deltaClass: 'live-status__delta--positive',
            };
        }
        if (isContraction) {
            return {
                emoji: '\u2193',
                mode: 'CONTRACTION',
                modeClass: 'live-status--contraction',
                headline: 'Supply is Shrinking',
                explanation: `Price is ${(Math.abs(deviation) * 100).toFixed(1)}% below target. When a rebase happens, everyone's wallet balance will decrease.`,
                delta: `${supplyDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })} BAMPL`,
                deltaClass: 'live-status__delta--negative',
            };
        }
        return {
            emoji: '\u2194',
            mode: 'EQUILIBRIUM',
            modeClass: 'live-status--equilibrium',
            headline: 'Price is on Target',
            explanation: 'Price is within the dead zone. No supply adjustment needed right now.',
            delta: '0 BAMPL',
            deltaClass: 'live-status__delta--neutral',
        };
    }, [isExpansion, isContraction, deviation, supplyDelta]);

    // Animated arrow SVGs
    const UpArrows = () => (
        <svg className="live-status__animated-arrows" viewBox="0 0 40 60" width="40" height="60">
            <path className="live-status__arrow-path live-status__arrow-path--1" d="M20 50 L8 38 M20 50 L32 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path className="live-status__arrow-path live-status__arrow-path--2" d="M20 36 L8 24 M20 36 L32 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path className="live-status__arrow-path live-status__arrow-path--3" d="M20 22 L8 10 M20 22 L32 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
    );

    const DownArrows = () => (
        <svg className="live-status__animated-arrows live-status__animated-arrows--down" viewBox="0 0 40 60" width="40" height="60">
            <path className="live-status__arrow-path live-status__arrow-path--1" d="M20 10 L8 22 M20 10 L32 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path className="live-status__arrow-path live-status__arrow-path--2" d="M20 24 L8 36 M20 24 L32 36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path className="live-status__arrow-path live-status__arrow-path--3" d="M20 38 L8 50 M20 38 L32 50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
    );

    return (
        <div className={`live-status ${statusConfig.modeClass}`}>
            <div className="live-status__top-row">
                <div className="live-status__mode-badge">
                    <span className="live-status__mode-dot" />
                    {statusConfig.mode}
                </div>
                <div className="live-status__epoch">
                    Epoch {currentEpoch.toString()}
                    {canRebase && <span className="live-status__ready-badge">REBASE READY</span>}
                </div>
            </div>

            <div className="live-status__main">
                <div className="live-status__price-comparison">
                    {/* Animated direction arrows on the left */}
                    <div className={`live-status__direction-arrows ${isEquilibrium ? 'live-status__direction-arrows--hidden' : ''}`}>
                        {isExpansion ? <UpArrows /> : <DownArrows />}
                    </div>

                    <div className="live-status__price-box">
                        <span className="live-status__price-label">Market Price</span>
                        <span className={`live-status__price-big ${isExpansion ? 'text-green' : isContraction ? 'text-red' : ''}`}>
                            {price.toFixed(2)}
                        </span>
                        <span className="live-status__price-unit">MOTO</span>
                    </div>

                    <div className="live-status__vs">
                        <div className={`live-status__vs-icon ${isEquilibrium ? '' : isExpansion ? 'live-status__vs-icon--above' : 'live-status__vs-icon--below'}`}>
                            {isExpansion ? '\u25B2' : isContraction ? '\u25BC' : '='}
                        </div>
                        <span className="live-status__vs-pct" style={{ color: isExpansion ? 'var(--accent-green)' : isContraction ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                            {deviation >= 0 ? '+' : ''}{(deviation * 100).toFixed(1)}%
                        </span>
                    </div>

                    <div className="live-status__price-box">
                        <span className="live-status__price-label">Target Price</span>
                        <span className="live-status__price-big live-status__price-big--target">
                            {target.toFixed(2)}
                        </span>
                        <span className="live-status__price-unit">MOTO</span>
                    </div>

                    {/* Animated direction arrows on the right */}
                    <div className={`live-status__direction-arrows ${isEquilibrium ? 'live-status__direction-arrows--hidden' : ''}`}>
                        {isExpansion ? <UpArrows /> : <DownArrows />}
                    </div>
                </div>

                <div className="live-status__explanation">
                    <p className="live-status__headline">{statusConfig.headline}</p>
                    <p className="live-status__desc">{statusConfig.explanation}</p>
                </div>

                {/* Visual supply flow */}
                <div className="live-status__supply-row">
                    <div className="live-status__supply-box">
                        <span className="live-status__supply-label">Current Supply</span>
                        <span className="live-status__supply-value">
                            {supply.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className={`live-status__supply-arrow ${isEquilibrium ? '' : 'live-status__supply-arrow--animated'}`}>
                        {isEquilibrium ? '=' : '\u2192'}
                    </div>
                    <div className="live-status__supply-box">
                        <span className="live-status__supply-label">After Rebase</span>
                        <span className={`live-status__supply-value ${statusConfig.deltaClass}`}>
                            {(supply + supplyDelta).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className="live-status__supply-box live-status__supply-box--delta">
                        <span className="live-status__supply-label">Change</span>
                        <span className={`live-status__supply-value ${statusConfig.deltaClass}`}>
                            {statusConfig.delta}
                        </span>
                    </div>
                </div>

                {/* What this means in plain English */}
                <div className="live-status__plain-english">
                    {isExpansion && (
                        <>
                            If you hold <strong>100 BAMPL</strong> now, after the next rebase you&apos;ll have
                            approximately <strong className="text-green">
                                {(100 + (100 * deviation / lag)).toFixed(2)} BAMPL
                            </strong>. Your ownership % stays the same &mdash; everyone gets more tokens equally.
                        </>
                    )}
                    {isContraction && (
                        <>
                            If you hold <strong>100 BAMPL</strong> now, after the next rebase you&apos;ll have
                            approximately <strong className="text-red">
                                {(100 + (100 * deviation / lag)).toFixed(2)} BAMPL
                            </strong>. Your ownership % stays the same &mdash; everyone loses tokens equally.
                        </>
                    )}
                    {isEquilibrium && (
                        <>
                            The price is close to the target. No tokens will be added or removed from wallets until
                            the price moves outside the dead zone.
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
