import { useState, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { FAUCET_URL, BAMPL_CONTRACT_ADDRESS } from '../config/addresses';

type FaucetState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Faucet panel that lets any user claim 1,000 free BAMPL tokens.
 * Requires wallet connection first, then calls the faucet backend.
 */
export function FaucetPanel() {
    const { isConnected, walletAddress, openConnectModal, hashedMLDSAKey, publicKey } = useWallet();
    const [state, setState] = useState<FaucetState>('idle');
    const [txHash, setTxHash] = useState('');
    const [error, setError] = useState('');

    const claim = useCallback(async () => {
        if (!walletAddress) return;
        setState('loading');
        setError('');

        try {
            const res = await fetch(`${FAUCET_URL}/api/faucet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: walletAddress,
                    hashedMLDSAKey: hashedMLDSAKey || undefined,
                    publicKey: publicKey || undefined,
                }),
            });

            const data = (await res.json()) as {
                success: boolean;
                txHash?: string;
                error?: string;
            };

            if (data.success && data.txHash) {
                setState('success');
                setTxHash(data.txHash);
            } else {
                setState('error');
                setError(data.error || 'Failed to claim tokens.');
            }
        } catch {
            setState('error');
            setError('Faucet server is unavailable. Please try again later.');
        }
    }, [walletAddress, hashedMLDSAKey, publicKey]);

    const [copied, setCopied] = useState(false);

    const copyCA = useCallback(() => {
        void navigator.clipboard.writeText(BAMPL_CONTRACT_ADDRESS).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);

    return (
        <div className="faucet glass-card glass-card--glow-green">
            <div className="faucet__contract-bar">
                <span className="faucet__contract-label">Contract Address</span>
                <button className="faucet__contract-copy" onClick={copyCA} title="Copy to clipboard">
                    <span className="faucet__contract-addr font-mono">{BAMPL_CONTRACT_ADDRESS}</span>
                    {copied ? (
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--clr-green)" strokeWidth="2">
                            <polyline points="3 8 7 12 13 4" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="5" y="5" width="9" height="9" rx="1" />
                            <path d="M3 11V3a1 1 0 0 1 1-1h8" />
                        </svg>
                    )}
                </button>
            </div>

            <div className="faucet__header">
                {/* Geometric drop icon */}
                <div className="faucet__icon">
                    <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
                        <path
                            d="M16 4 L24 16 A8 8 0 1 1 8 16 Z"
                            fill="currentColor"
                            opacity="0.15"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        />
                    </svg>
                </div>
                <div>
                    <h3 className="faucet__title">Get Free BAMPL</h3>
                    <p className="faucet__subtitle">
                        Claim 1,000 tokens to experience elastic supply firsthand
                    </p>
                </div>
            </div>

            <div className="faucet__body">
                <div className="faucet__amount-display">
                    <span className="faucet__amount-value">1,000</span>
                    <span className="faucet__amount-unit">BAMPL</span>
                </div>

                {!isConnected ? (
                    <button
                        className="btn btn--primary btn--lg faucet__btn"
                        onClick={openConnectModal}
                    >
                        Connect Wallet to Claim
                    </button>
                ) : state === 'idle' ? (
                    <button
                        className="btn btn--primary btn--lg faucet__btn"
                        onClick={claim}
                    >
                        Claim 1,000 BAMPL
                    </button>
                ) : state === 'loading' ? (
                    <div className="faucet__loading">
                        <span className="spinner" />
                        <span>Sending tokens to your wallet...</span>
                    </div>
                ) : state === 'success' ? (
                    <div className="faucet__success">
                        <div className="faucet__check-icon">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="5 12 10 17 19 7" />
                            </svg>
                        </div>
                        <p className="faucet__success-text">1,000 BAMPL sent to your wallet</p>
                        <div className="faucet__tx-links">
                            <a
                                href={`https://testnet.opnet.org/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="faucet__tx-link"
                            >
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10M10 2h4v4M7 9l7-7" />
                                </svg>
                                View on OPScan
                            </a>
                            <a
                                href={`https://mempool.opnet.org/testnet4/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="faucet__tx-link"
                            >
                                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10M10 2h4v4M7 9l7-7" />
                                </svg>
                                View on Mempool
                            </a>
                        </div>
                        <p className="faucet__tx font-mono">
                            {txHash.slice(0, 16)}...{txHash.slice(-8)}
                        </p>
                        <p className="faucet__note">
                            Balance will appear after the next block confirmation (~10 min).
                            Watch the dashboard to see your balance change during rebases.
                        </p>
                    </div>
                ) : (
                    <div className="faucet__error">
                        <p className="faucet__error-text">{error}</p>
                        <button
                            className="btn btn--secondary faucet__btn"
                            onClick={() => setState('idle')}
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
