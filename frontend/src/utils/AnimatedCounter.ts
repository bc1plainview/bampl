/**
 * Animated number counter using requestAnimationFrame with cubic easing.
 *
 * Usage:
 *   const counter = new AnimatedCounter(500);
 *   counter.animateTo(42.5, (current) => setText(current.toFixed(2)));
 *
 * The class smoothly interpolates between the current displayed value
 * and the target over `durationMs` milliseconds using a cubic ease-out curve.
 */
export class AnimatedCounter {
    private currentValue = 0;
    private targetValue = 0;
    private startValue = 0;
    private startTime = 0;
    private durationMs: number;
    private rafId: number | null = null;
    private onUpdate: ((value: number) => void) | null = null;

    constructor(durationMs = 500) {
        this.durationMs = durationMs;
    }

    /**
     * Cubic ease-out: decelerating to zero velocity.
     * t is normalised [0, 1].
     */
    private static easeOutCubic(t: number): number {
        const t1 = t - 1;
        return t1 * t1 * t1 + 1;
    }

    /**
     * Begin (or re-target) an animation toward `target`.
     * Calls `callback` on every animation frame with the intermediate value.
     */
    animateTo(target: number, callback: (value: number) => void): void {
        // If already at the target, just invoke callback directly
        if (target === this.currentValue && this.rafId === null) {
            callback(target);
            return;
        }

        this.onUpdate = callback;
        this.targetValue = target;
        this.startValue = this.currentValue;
        this.startTime = performance.now();

        if (this.rafId === null) {
            this.tick();
        }
    }

    /** Immediately jump to a value without animation. */
    set(value: number): void {
        this.cancel();
        this.currentValue = value;
        this.targetValue = value;
    }

    /** Cancel any running animation. */
    cancel(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /** Current displayed value (for reading outside of callback). */
    get value(): number {
        return this.currentValue;
    }

    /** Destroy the counter, cancelling any pending frame. */
    destroy(): void {
        this.cancel();
        this.onUpdate = null;
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    private tick = (): void => {
        const elapsed = performance.now() - this.startTime;
        const progress = Math.min(elapsed / this.durationMs, 1);
        const eased = AnimatedCounter.easeOutCubic(progress);

        this.currentValue = this.startValue + (this.targetValue - this.startValue) * eased;

        if (this.onUpdate) {
            this.onUpdate(this.currentValue);
        }

        if (progress < 1) {
            this.rafId = requestAnimationFrame(this.tick);
        } else {
            this.currentValue = this.targetValue;
            this.rafId = null;
        }
    };
}
