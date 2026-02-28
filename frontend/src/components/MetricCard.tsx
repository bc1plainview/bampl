import { useEffect, useRef, useState } from 'react';
import { AnimatedCounter } from '../utils/AnimatedCounter';

export type TrendDirection = 'up' | 'down' | 'neutral';

export interface MetricCardProps {
    /** Upper label text */
    label: string;
    /** Numeric value to display (will be animated) */
    value: number;
    /** Format function applied to the animated number for display */
    formatValue?: (n: number) => string;
    /** Secondary text beneath the value */
    subValue?: string;
    /** Trend direction arrow indicator */
    trend?: TrendDirection;
    /** Trend label text (e.g. "+5.2%") */
    trendLabel?: string;
    /** Accent colour class suffix: green | red | blue | purple */
    accentColor?: string;
    /** Additional CSS className */
    className?: string;
}

/**
 * Reusable glass-card metric display.
 *
 * Uses AnimatedCounter to smoothly transition the value on change.
 */
export function MetricCard({
    label,
    value,
    formatValue,
    subValue,
    trend,
    trendLabel,
    accentColor = 'green',
    className = '',
}: MetricCardProps) {
    const counterRef = useRef<AnimatedCounter | null>(null);
    const [displayValue, setDisplayValue] = useState('0');
    const fmt = formatValue ?? ((n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 }));

    useEffect(() => {
        if (!counterRef.current) {
            counterRef.current = new AnimatedCounter(500);
        }
        counterRef.current.animateTo(value, (v) => {
            setDisplayValue(fmt(v));
        });
    }, [value, fmt]);

    useEffect(() => {
        return () => counterRef.current?.destroy();
    }, []);

    const glowClass = `glass-card--glow-${accentColor}`;

    return (
        <div className={`glass-card ${glowClass} metric-card ${className}`}>
            <div className="metric-card__label">{label}</div>
            <div className="metric-card__value">{displayValue}</div>
            {subValue && <div className="metric-card__sub">{subValue}</div>}
            {trend && trend !== 'neutral' && (
                <div className={`metric-card__trend metric-card__trend--${trend}`}>
                    <span
                        className={`metric-card__trend-arrow metric-card__trend-arrow--${trend}`}
                        aria-hidden="true"
                    />
                    {trendLabel}
                </div>
            )}
            {trend === 'neutral' && trendLabel && (
                <div className="metric-card__trend metric-card__trend--neutral">
                    {trendLabel}
                </div>
            )}
        </div>
    );
}
