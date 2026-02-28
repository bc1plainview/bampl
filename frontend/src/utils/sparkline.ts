/**
 * Canvas sparkline renderer.
 *
 * Draws a smooth line chart with an optional gradient fill beneath the line
 * onto a provided HTMLCanvasElement.  Fully self-contained -- no external
 * charting libraries required.
 */

export interface SparklineOptions {
    /** Stroke color for the line. */
    lineColor?: string;
    /** Width of the stroke. */
    lineWidth?: number;
    /** Fill gradient start (top) color. Use rgba for translucency. */
    fillColorTop?: string;
    /** Fill gradient end (bottom) color. */
    fillColorBottom?: string;
    /** Left/right padding inside the canvas (px). */
    paddingX?: number;
    /** Top/bottom padding inside the canvas (px). */
    paddingY?: number;
    /** Whether to draw the gradient fill beneath the line. */
    fill?: boolean;
    /** Draw a small circle on the last data point. */
    showLastDot?: boolean;
    /** Radius of the last-point dot. */
    dotRadius?: number;
}

const DEFAULTS: Required<SparklineOptions> = {
    lineColor: '#00F0A0',
    lineWidth: 2,
    fillColorTop: 'rgba(0, 240, 160, 0.25)',
    fillColorBottom: 'rgba(0, 240, 160, 0.00)',
    paddingX: 4,
    paddingY: 4,
    fill: true,
    showLastDot: true,
    dotRadius: 3,
};

/**
 * Render a sparkline onto a canvas.
 *
 * @param canvas  Target <canvas> element.
 * @param data    Array of numeric values (at least 2 for a visible line).
 * @param opts    Optional visual configuration.
 */
export function drawSparkline(
    canvas: HTMLCanvasElement,
    data: number[],
    opts?: SparklineOptions,
): void {
    const o = { ...DEFAULTS, ...opts };
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Support HiDPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) {
        // Not enough data -- draw a flat line at center
        ctx.strokeStyle = o.lineColor;
        ctx.lineWidth = o.lineWidth;
        ctx.beginPath();
        ctx.moveTo(o.paddingX, h / 2);
        ctx.lineTo(w - o.paddingX, h / 2);
        ctx.stroke();
        return;
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // avoid divide-by-zero

    const plotW = w - o.paddingX * 2;
    const plotH = h - o.paddingY * 2;

    const toX = (i: number) => o.paddingX + (i / (data.length - 1)) * plotW;
    const toY = (v: number) => o.paddingY + plotH - ((v - min) / range) * plotH;

    // Build the path points
    const points: { x: number; y: number }[] = data.map((v, i) => ({
        x: toX(i),
        y: toY(v),
    }));

    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return;

    // --- Gradient fill ---
    if (o.fill) {
        const grad = ctx.createLinearGradient(0, o.paddingY, 0, h - o.paddingY);
        grad.addColorStop(0, o.fillColorTop);
        grad.addColorStop(1, o.fillColorBottom);

        ctx.beginPath();
        ctx.moveTo(first.x, h - o.paddingY);
        for (const p of points) {
            ctx.lineTo(p.x, p.y);
        }
        ctx.lineTo(last.x, h - o.paddingY);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // --- Line ---
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
        // Simple cardinal-spline-ish smoothing via quadratic midpoint
        const prev = points[i - 1]!;
        const curr = points[i]!;
        const cpx = (prev.x + curr.x) / 2;
        const cpy = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
    }
    // Final segment to last point
    ctx.lineTo(last.x, last.y);

    ctx.strokeStyle = o.lineColor;
    ctx.lineWidth = o.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // --- Last-point dot ---
    if (o.showLastDot) {
        ctx.beginPath();
        ctx.arc(last.x, last.y, o.dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = o.lineColor;
        ctx.fill();

        // Glow ring
        ctx.beginPath();
        ctx.arc(last.x, last.y, o.dotRadius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = o.lineColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}
