import { useMemo } from 'react';

export interface DeviationBarProps {
    /**
     * Deviation fraction from target.
     * Positive = expansion (above target), negative = contraction (below target).
     * E.g., 0.05 means 5% above, -0.10 means 10% below.
     */
    deviation: number;
    /**
     * Dead-zone threshold fraction (e.g. 0.05 for a 5% dead zone on each side).
     */
    threshold: number;
}

/**
 * Visual bar showing price deviation from target.
 *
 * Layout:
 *   [contraction zone] [dead zone (center)] [expansion zone]
 *
 * The center point represents the target price (deviation = 0).
 * A glowing dot shows the current deviation position.
 * The dead zone is rendered as a dimmed center band.
 *
 * The bar maps deviation range [-maxDev, +maxDev] to [0%, 100%].
 * maxDev is clamped to 0.5 (50%) for display purposes.
 */
export function DeviationBar({ deviation, threshold }: DeviationBarProps) {
    const maxDev = 0.5; // 50% display range

    const clampedDev = Math.max(-maxDev, Math.min(maxDev, deviation));

    // Position of the dot: 50% = center (target), 0% = -maxDev, 100% = +maxDev
    const dotPercent = ((clampedDev + maxDev) / (maxDev * 2)) * 100;

    // Dead-zone bounds (centered on 50%)
    const dzHalf = (threshold / maxDev) * 50;
    const dzLeft = 50 - dzHalf;
    const dzWidth = dzHalf * 2;

    // Fill bar: from center (50%) toward the dot
    const fillStyle = useMemo(() => {
        if (Math.abs(deviation) <= threshold) {
            // Inside dead zone -- no fill
            return { left: '50%', width: '0%' };
        }
        if (deviation > 0) {
            return {
                left: `${50 + dzHalf}%`,
                width: `${dotPercent - 50 - dzHalf}%`,
            };
        }
        // Negative
        const fillWidth = 50 - dzHalf - dotPercent;
        return {
            left: `${dotPercent}%`,
            width: `${fillWidth}%`,
        };
    }, [deviation, threshold, dotPercent, dzHalf]);

    const isPositive = deviation > threshold;
    const isNegative = deviation < -threshold;

    const dotClass = isPositive
        ? 'deviation-bar__dot--positive'
        : isNegative
          ? 'deviation-bar__dot--negative'
          : 'deviation-bar__dot--neutral';

    const fillClass = isPositive
        ? 'deviation-bar__fill--positive'
        : 'deviation-bar__fill--negative';

    const pctText = `${deviation >= 0 ? '+' : ''}${(deviation * 100).toFixed(2)}%`;
    const pctColor = isPositive
        ? 'var(--accent-green)'
        : isNegative
          ? 'var(--accent-red)'
          : 'var(--text-muted)';

    return (
        <div className="deviation-bar">
            <div className="deviation-bar__label-row">
                <span>Contraction</span>
                <span>Target</span>
                <span>Expansion</span>
            </div>

            <div className="deviation-bar__track">
                {/* Dead zone band */}
                <div
                    className="deviation-bar__deadzone"
                    style={{ left: `${dzLeft}%`, width: `${dzWidth}%` }}
                />

                {/* Directional fill */}
                {Math.abs(deviation) > threshold && (
                    <div
                        className={`deviation-bar__fill ${fillClass}`}
                        style={fillStyle}
                    />
                )}

                {/* Current price dot */}
                <div
                    className={`deviation-bar__dot ${dotClass}`}
                    style={{ left: `${dotPercent}%` }}
                />
            </div>

            <div className="deviation-bar__pct" style={{ color: pctColor }}>
                {pctText} from target
            </div>
        </div>
    );
}
