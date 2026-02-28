import { useMemo } from 'react';
import { BAMPL_DECIMALS } from '../config/addresses';

interface PriceGaugeProps {
    currentPrice: bigint;
    targetPrice: bigint;
    deviationThreshold: bigint;
}

/**
 * Visual gauge / thermometer showing price position relative to target.
 * Makes it instantly obvious: are we above, below, or on target?
 *
 * The needle moves left/right based on deviation. Dead zone is shown
 * as a highlighted center band.
 */
export function PriceGauge({ currentPrice, targetPrice, deviationThreshold }: PriceGaugeProps) {
    const price = Number(currentPrice) / 10 ** BAMPL_DECIMALS;
    const target = Number(targetPrice) / 10 ** BAMPL_DECIMALS;
    const threshold = Number(deviationThreshold) / 10 ** BAMPL_DECIMALS;

    const config = useMemo(() => {
        if (target === 0) return { deviation: 0, needlePos: 50, zone: 'equilibrium' as const };

        const deviation = (price - target) / target;
        // Map deviation to 0-100 scale. Clamp to +/- 30% for visual purposes.
        const maxDev = 0.3;
        const clamped = Math.max(-maxDev, Math.min(maxDev, deviation));
        const needlePos = 50 + (clamped / maxDev) * 50;

        const zone: 'expansion' | 'contraction' | 'equilibrium' =
            deviation > threshold ? 'expansion' :
            deviation < -threshold ? 'contraction' :
            'equilibrium';

        return { deviation, needlePos, zone };
    }, [price, target, threshold]);

    // Dead zone visual width (proportional to threshold)
    const deadZoneWidth = Math.min(30, (threshold / 0.3) * 50);

    return (
        <div className="price-gauge">
            <div className="price-gauge__labels">
                <span className="price-gauge__label price-gauge__label--left">
                    Supply Shrinks
                </span>
                <span className="price-gauge__label price-gauge__label--center">
                    On Target
                </span>
                <span className="price-gauge__label price-gauge__label--right">
                    Supply Grows
                </span>
            </div>

            <div className="price-gauge__track">
                {/* Contraction zone (left) */}
                <div className="price-gauge__zone price-gauge__zone--contraction" />

                {/* Dead zone (center) */}
                <div
                    className="price-gauge__zone price-gauge__zone--dead"
                    style={{
                        left: `${50 - deadZoneWidth}%`,
                        width: `${deadZoneWidth * 2}%`,
                    }}
                />

                {/* Expansion zone (right) */}
                <div className="price-gauge__zone price-gauge__zone--expansion" />

                {/* Tick marks */}
                <div className="price-gauge__tick price-gauge__tick--center" />
                <div className="price-gauge__tick price-gauge__tick--left" style={{ left: `${50 - deadZoneWidth}%` }} />
                <div className="price-gauge__tick price-gauge__tick--right" style={{ left: `${50 + deadZoneWidth}%` }} />

                {/* Needle */}
                <div
                    className={`price-gauge__needle price-gauge__needle--${config.zone}`}
                    style={{ left: `${config.needlePos}%` }}
                >
                    <div className="price-gauge__needle-pip" />
                    <div className="price-gauge__needle-line" />
                </div>
            </div>

            <div className="price-gauge__values">
                <span className="price-gauge__value price-gauge__value--low">-30%</span>
                <span className={`price-gauge__value price-gauge__value--current price-gauge__value--${config.zone}`}>
                    {config.deviation >= 0 ? '+' : ''}{(config.deviation * 100).toFixed(1)}%
                </span>
                <span className="price-gauge__value price-gauge__value--high">+30%</span>
            </div>

            {/* Big plain-English status */}
            <div className={`price-gauge__status price-gauge__status--${config.zone}`}>
                {config.zone === 'expansion' && (
                    <>Price is <strong>above</strong> target &mdash; next rebase will <strong>increase</strong> everyone&apos;s balance</>
                )}
                {config.zone === 'contraction' && (
                    <>Price is <strong>below</strong> target &mdash; next rebase will <strong>decrease</strong> everyone&apos;s balance</>
                )}
                {config.zone === 'equilibrium' && (
                    <>Price is <strong>on target</strong> &mdash; no supply change needed right now</>
                )}
            </div>
        </div>
    );
}
