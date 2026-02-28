import { WalletButton } from './WalletButton';

/**
 * Fixed header bar with BAMPL brand identity, network indicator, and wallet button.
 */
export function Header() {
    return (
        <header className="header">
            <div className="header__logo">
                <div className="header__logo-mark" aria-hidden="true">
                    <div className="header__logo-ring" />
                    <div className="header__logo-core" />
                </div>
                <span className="header__logo-text">BAMPL</span>
            </div>

            <nav className="header__nav">
                <span className="header__network-badge">
                    OPNet Testnet
                </span>
                <WalletButton />
            </nav>
        </header>
    );
}
