import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { LiveStatus } from './components/LiveStatus';
import { PriceGauge } from './components/PriceGauge';
import { MetricCard } from './components/MetricCard';
import { FaucetPanel } from './components/FaucetPanel';
import { RebasePanel } from './components/RebasePanel';
import { YourSlice } from './components/YourSlice';
import { AdminPanel } from './components/AdminPanel';
import { Footer } from './components/Footer';
import { useBAMPL } from './hooks/useBAMPL';
import { useWallet } from './hooks/useWallet';
import { useRebaseHistory } from './hooks/useRebaseHistory';
import { computeDeviation } from './utils/formatters';
import { BAMPL_DECIMALS } from './config/addresses';

export default function App() {
    const bampl = useBAMPL();
    const { isConnected } = useWallet();
    const [showExplainer, setShowExplainer] = useState(true);
    const [rebaseFlash, setRebaseFlash] = useState(false);

    const { supplyValues, history } = useRebaseHistory(
        bampl.totalSupply,
        bampl.currentEpoch,
    );

    const lastDelta = useMemo(() => {
        if (history.length < 2) return 0;
        const last = history[history.length - 1];
        return last ? last.delta : 0;
    }, [history]);

    // Flash animation when a rebase is detected
    const prevEpoch = useRef(bampl.currentEpoch);
    useEffect(() => {
        if (bampl.currentEpoch > prevEpoch.current && prevEpoch.current > 0n) {
            setRebaseFlash(true);
            const timer = setTimeout(() => setRebaseFlash(false), 3000);
            return () => clearTimeout(timer);
        }
        prevEpoch.current = bampl.currentEpoch;
        return undefined;
    }, [bampl.currentEpoch]);

    // Faucet scroll target
    const faucetRef = useRef<HTMLDivElement | null>(null);
    const scrollToFaucet = useCallback(() => {
        faucetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    // Scroll animation via IntersectionObserver
    const observerRef = useRef<IntersectionObserver | null>(null);
    const animateRefs = useRef<(HTMLDivElement | null)[]>([]);

    const setAnimRef = useCallback(
        (index: number) => (el: HTMLDivElement | null) => {
            animateRefs.current[index] = el;
        },
        [],
    );

    useEffect(() => {
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('scroll-animate--visible');
                    }
                });
            },
            { threshold: 0.1 },
        );

        animateRefs.current.forEach((el) => {
            if (el) observerRef.current?.observe(el);
        });

        return () => observerRef.current?.disconnect();
    }, []);

    // Computed display values
    const priceDisplay = Number(bampl.currentPrice) / 10 ** BAMPL_DECIMALS;
    const supplyDisplay = Number(bampl.totalSupply) / 10 ** BAMPL_DECIMALS;
    const balanceDisplay = Number(bampl.balance) / 10 ** BAMPL_DECIMALS;

    const deviation = computeDeviation(bampl.currentPrice, bampl.targetPrice);
    const deviationPct = `${deviation >= 0 ? '+' : ''}${(deviation * 100).toFixed(2)}%`;
    const deviationTrend: 'up' | 'down' | 'neutral' =
        deviation > 0.001 ? 'up' : deviation < -0.001 ? 'down' : 'neutral';

    const blocksUntilRebase = bampl.nextRebaseBlock > 0n
        ? bampl.nextRebaseBlock.toString()
        : '--';

    return (
        <div className={`app ${rebaseFlash ? 'app--rebase-flash' : ''}`}>
            {/* Background glow orbs */}
            <div className="glow-orb glow-orb--green" />
            <div className="glow-orb glow-orb--purple" />
            <div className="glow-orb glow-orb--blue" />

            <Header />

            {/* Rebase flash banner */}
            {rebaseFlash && (
                <div className="rebase-flash-banner">
                    REBASE DETECTED — Supply just changed. Watch your balance update.
                </div>
            )}

            {/* Hero Section */}
            <Hero onScrollToFaucet={scrollToFaucet} />

            <main className="main">
                {/* How It Works explainer */}
                {showExplainer && (
                    <div className="scroll-animate scroll-animate--visible" ref={setAnimRef(0)}>
                        <HowItWorks />
                        <button
                            className="how-it-works__dismiss"
                            onClick={() => setShowExplainer(false)}
                        >
                            Got it, hide this
                        </button>
                    </div>
                )}

                {/* Live Status banner */}
                <div className="scroll-animate" ref={setAnimRef(1)}>
                    <LiveStatus
                        currentPrice={bampl.currentPrice}
                        targetPrice={bampl.targetPrice}
                        totalSupply={bampl.totalSupply}
                        currentEpoch={bampl.currentEpoch}
                        rebaseLag={bampl.rebaseLag}
                        canRebase={bampl.canRebase}
                        deviationThreshold={bampl.deviationThreshold}
                    />
                </div>

                {/* Price Gauge thermometer */}
                <div className="scroll-animate" ref={setAnimRef(2)}>
                    <PriceGauge
                        currentPrice={bampl.currentPrice}
                        targetPrice={bampl.targetPrice}
                        deviationThreshold={bampl.deviationThreshold}
                    />
                </div>

                {/* Metrics Row */}
                <div className="metrics-row scroll-animate" ref={setAnimRef(3)}>
                    <MetricCard
                        label="BAMPL Price"
                        value={priceDisplay}
                        formatValue={(n) =>
                            n.toLocaleString(undefined, {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                            })
                        }
                        subValue="BAMPL / MOTO"
                        trend={deviationTrend}
                        trendLabel={deviationPct}
                        accentColor={deviationTrend === 'up' ? 'green' : deviationTrend === 'down' ? 'red' : 'blue'}
                        className="scroll-animate--delay-1"
                    />
                    <MetricCard
                        label="Total Supply"
                        value={supplyDisplay}
                        formatValue={(n) =>
                            n.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        }
                        subValue="BAMPL in circulation"
                        accentColor="blue"
                        className="scroll-animate--delay-2"
                    />
                    <MetricCard
                        label="Your Balance"
                        value={balanceDisplay}
                        formatValue={(n) =>
                            isConnected
                                ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : '--'
                        }
                        subValue={isConnected ? 'BAMPL in your wallet' : 'Connect wallet to see'}
                        accentColor="purple"
                        className="scroll-animate--delay-3"
                    />
                    <MetricCard
                        label="Next Rebase"
                        value={bampl.canRebase ? 0 : Number(bampl.nextRebaseBlock)}
                        formatValue={() =>
                            bampl.canRebase ? 'NOW' : `Block ${blocksUntilRebase}`
                        }
                        subValue={bampl.canRebase ? 'Ready to trigger!' : `Epoch ${bampl.currentEpoch.toString()}`}
                        trend={bampl.canRebase ? 'up' : 'neutral'}
                        trendLabel={bampl.canRebase ? 'Ready' : 'Waiting'}
                        accentColor={bampl.canRebase ? 'green' : 'blue'}
                        className="scroll-animate--delay-4"
                    />
                </div>

                {/* Faucet Panel */}
                <div className="scroll-animate" ref={(el) => {
                    setAnimRef(4)(el);
                    faucetRef.current = el;
                }}>
                    <FaucetPanel />
                </div>

                {/* Main Panels Row */}
                <div className="panels-row scroll-animate" ref={setAnimRef(5)}>
                    <RebasePanel
                        currentPrice={bampl.currentPrice}
                        targetPrice={bampl.targetPrice}
                        totalSupply={bampl.totalSupply}
                        canRebase={bampl.canRebase}
                        deviationThreshold={bampl.deviationThreshold}
                        rebaseLag={bampl.rebaseLag}
                        currentEpoch={bampl.currentEpoch}
                        nextRebaseBlock={bampl.nextRebaseBlock}
                        loading={bampl.loading}
                        supplyHistory={supplyValues}
                        onTriggerRebase={bampl.triggerRebase}
                    />
                    <YourSlice
                        balance={bampl.balance}
                        totalSupply={bampl.totalSupply}
                        scaledBalance={bampl.scaledBalance}
                        scaledTotalSupply={bampl.scaledTotalSupply}
                        lastDelta={lastDelta}
                    />
                </div>

                {/* Admin Panel - deployer only */}
                {isConnected && (
                    <div className="scroll-animate" ref={setAnimRef(6)} style={{ maxWidth: 640 }}>
                        <AdminPanel
                            currentPrice={bampl.currentPrice}
                            targetPrice={bampl.targetPrice}
                            epochLength={bampl.epochLength}
                            rebaseLag={bampl.rebaseLag}
                            deviationThreshold={bampl.deviationThreshold}
                            onPostPrice={bampl.postPrice}
                            onEnableDemoMode={bampl.enableDemoMode}
                            onSetEpochLength={bampl.setEpochLength}
                        />
                    </div>
                )}

                {bampl.error && (
                    <div className="toast toast--error" style={{ marginTop: 24, position: 'relative', bottom: 'auto', right: 'auto' }}>
                        RPC Error: {bampl.error}
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
