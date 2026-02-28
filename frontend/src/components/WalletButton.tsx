import { useWallet } from '../hooks/useWallet';

/**
 * Connect / disconnect wallet button.
 *
 * When disconnected, shows "Connect Wallet" and opens the WalletConnect modal.
 * When connected, shows a truncated address with a green dot indicator;
 * clicking it disconnects.
 */
export function WalletButton() {
    const { isConnected, connecting, displayAddress, openConnectModal, disconnect } =
        useWallet();

    if (connecting) {
        return (
            <button className="wallet-btn" disabled>
                <span className="spinner" />
                Connecting...
            </button>
        );
    }

    if (isConnected) {
        return (
            <button
                className="wallet-btn wallet-btn--connected"
                onClick={disconnect}
                title="Click to disconnect"
            >
                <span className="wallet-btn__dot" />
                <span>{displayAddress}</span>
                <span className="wallet-btn__disconnect">x</span>
            </button>
        );
    }

    return (
        <button className="wallet-btn" onClick={openConnectModal}>
            Connect Wallet
        </button>
    );
}
