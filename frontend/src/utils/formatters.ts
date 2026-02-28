/**
 * Formatting utilities for BAMPL protocol display values.
 *
 * All bigint values from the contract are u256 with 8-decimal fixed-point
 * encoding (1 BAMPL = 100_000_000 raw units).
 */

const DECIMALS = 8;
const DIVISOR = 10 ** DECIMALS; // 100_000_000

/**
 * Format a raw u256 BAMPL amount to a human-readable string.
 * Shows up to `precision` decimal places, defaults to 4.
 */
export function formatBAMPL(raw: bigint, precision = 4): string {
    if (raw === 0n) return '0';

    const isNegative = raw < 0n;
    const abs = isNegative ? -raw : raw;
    const whole = abs / BigInt(DIVISOR);
    const frac = abs % BigInt(DIVISOR);

    const fracStr = frac.toString().padStart(DECIMALS, '0').slice(0, precision);
    // Trim trailing zeros but keep at least 1 decimal
    const trimmed = fracStr.replace(/0+$/, '') || '0';

    const sign = isNegative ? '-' : '';
    const wholeFormatted = formatWithCommas(whole.toString());

    if (trimmed === '0' && precision === 0) return `${sign}${wholeFormatted}`;
    return `${sign}${wholeFormatted}.${trimmed}`;
}

/**
 * Same as formatBAMPL but labelled for MOTO amounts (same 8-decimal encoding).
 */
export function formatMOTO(raw: bigint, precision = 4): string {
    return formatBAMPL(raw, precision);
}

/**
 * Format a percentage value. Expects a raw u256 where 1e8 = 100%.
 * E.g., 5_000_000n (0.05 * 1e8) => "5.00%"
 */
export function formatPercent(raw: bigint, precision = 2): string {
    const pct = (Number(raw) / DIVISOR) * 100;
    return `${pct.toFixed(precision)}%`;
}

/**
 * Format a bigint block height with comma separators.
 */
export function formatBlockHeight(height: bigint): string {
    return formatWithCommas(height.toString());
}

/**
 * Format a plain number with comma-separated thousands.
 */
export function formatWithCommas(value: string): string {
    const parts = value.split('.');
    const whole = parts[0] ?? '';
    parts[0] = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

/**
 * Format a signed delta for display, e.g. "+12.3456" or "-0.5000".
 */
export function formatDelta(raw: bigint, precision = 4): string {
    if (raw === 0n) return '0';
    const sign = raw > 0n ? '+' : '';
    return `${sign}${formatBAMPL(raw, precision)}`;
}

/**
 * Compute the deviation between current price and target price as a number.
 * Returns a fraction: 0.05 means 5% above target, -0.10 means 10% below.
 */
export function computeDeviation(currentPrice: bigint, targetPrice: bigint): number {
    if (targetPrice === 0n) return 0;
    return (Number(currentPrice) - Number(targetPrice)) / Number(targetPrice);
}

/**
 * Compute the network share percentage.
 * scaledBalance / scaledTotalSupply * 100
 */
export function computeNetworkShare(
    scaledBalance: bigint,
    scaledTotalSupply: bigint,
): number {
    if (scaledTotalSupply === 0n) return 0;
    return (Number(scaledBalance) / Number(scaledTotalSupply)) * 100;
}

/**
 * Shorten an address for display: first 8 + last 4 characters.
 */
export function shortenAddress(address: string, prefixLen = 8, suffixLen = 4): string {
    if (address.length <= prefixLen + suffixLen + 3) return address;
    return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}
