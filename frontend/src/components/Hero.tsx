import { useWallet } from '../hooks/useWallet';

interface HeroProps {
    onScrollToFaucet: () => void;
}

/**
 * Full-width hero section with BAMPL branding, tagline, and CTAs.
 * Provides the "wow factor" first impression for the contest.
 */
export function Hero({ onScrollToFaucet }: HeroProps) {
    const { isConnected, openConnectModal } = useWallet();

    return (
        <section className="hero">
            {/* Animated gradient mesh background */}
            <div className="hero__mesh hero__mesh--1" />
            <div className="hero__mesh hero__mesh--2" />

            <div className="hero__content">
                <div className="hero__badge">
                    <span className="hero__badge-dot" />
                    Live on Bitcoin L1 via OPNet
                </div>

                <h1 className="hero__title">BAMPL</h1>
                <p className="hero__tagline">
                    Bitcoin&apos;s First Elastic Supply Token
                </p>

                <p className="hero__desc">
                    When demand pushes price above the target, supply <strong className="text-green">expands</strong>.
                    When price drops below, supply <strong className="text-red">contracts</strong>.
                    Your percentage of the network <strong>never changes</strong>.
                </p>

                <div className="hero__actions">
                    {!isConnected && (
                        <button
                            className="btn btn--primary btn--lg hero__btn"
                            onClick={openConnectModal}
                        >
                            Connect Wallet
                        </button>
                    )}
                    <button
                        className="btn btn--secondary btn--lg hero__btn"
                        onClick={onScrollToFaucet}
                    >
                        Get Free BAMPL
                    </button>
                </div>

                <div className="hero__stats">
                    <div className="hero__stat-divider" />
                    <span className="hero__stat-label">
                        Elastic supply protocol &mdash; live on testnet
                    </span>
                    <div className="hero__stat-divider" />
                </div>
            </div>
        </section>
    );
}
