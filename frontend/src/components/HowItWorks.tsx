/**
 * Visual explainer banner showing how BAMPL's elastic supply works.
 * Designed for people who have never heard of Ampleforth.
 */
export function HowItWorks() {
    return (
        <div className="how-it-works">
            <div className="how-it-works__header">
                <h2 className="how-it-works__title">How BAMPL Works</h2>
                <p className="how-it-works__subtitle">
                    An elastic supply token that automatically adjusts to maintain a target price
                </p>
            </div>

            <div className="how-it-works__steps">
                <div className="how-it-works__step">
                    <div className="how-it-works__step-icon how-it-works__step-icon--target">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                            <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2" />
                            <circle cx="14" cy="14" r="7" stroke="currentColor" strokeWidth="2" />
                            <circle cx="14" cy="14" r="2.5" fill="currentColor" />
                        </svg>
                    </div>
                    <div className="how-it-works__step-num">1</div>
                    <h3 className="how-it-works__step-title">Target Price</h3>
                    <p className="how-it-works__step-desc">
                        BAMPL has a target price of <strong>1.00 MOTO</strong>. The protocol
                        constantly checks: is the market price above or below this target?
                    </p>
                </div>

                <div className="how-it-works__arrow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <div className="how-it-works__step">
                    <div className="how-it-works__step-icon how-it-works__step-icon--rebase">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                            <path d="M7 14h14M14 7v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M4 4l6 2-2 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M24 24l-6-2 2-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="how-it-works__step-num">2</div>
                    <h3 className="how-it-works__step-title">Supply Adjusts</h3>
                    <p className="how-it-works__step-desc">
                        <span className="text-green">Price too high?</span> Supply <strong>increases</strong> (everyone gets more tokens).{' '}
                        <span className="text-red">Price too low?</span> Supply <strong>decreases</strong> (everyone has fewer tokens).
                    </p>
                </div>

                <div className="how-it-works__arrow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <div className="how-it-works__step">
                    <div className="how-it-works__step-icon how-it-works__step-icon--share">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                            <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2" />
                            <path d="M14 2a12 12 0 0 1 0 24" fill="currentColor" opacity="0.3" />
                            <path d="M14 6v16M8 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                        </svg>
                    </div>
                    <div className="how-it-works__step-num">3</div>
                    <h3 className="how-it-works__step-title">Your Share Stays</h3>
                    <p className="how-it-works__step-desc">
                        Your <strong>percentage of total supply never changes</strong>. If you own 1% of
                        BAMPL, you always own 1% - even as the total number of tokens changes.
                    </p>
                </div>
            </div>

            <div className="how-it-works__tldr">
                Think of it like a pie: the pie gets bigger or smaller, but your <em>slice</em> stays the same size.
            </div>
        </div>
    );
}
