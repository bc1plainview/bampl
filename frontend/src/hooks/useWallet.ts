import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { useCallback } from 'react';

/**
 * Thin convenience wrapper around the WalletConnect hook.
 *
 * Surfaces only the properties the BAMPL UI cares about and
 * normalises the connect / disconnect lifecycle.
 */
export function useWallet() {
    const {
        openConnectModal,
        connectToWallet,
        disconnect,
        walletAddress,
        publicKey,
        network,
        walletBalance,
        provider: walletProvider,
        connecting,
        allWallets,
        signer,
        walletInstance,
        address,
        hashedMLDSAKey,
    } = useWalletConnect();

    const isConnected = !!walletAddress;

    /** Installed wallet list for optional direct-connect buttons */
    const installedWallets = allWallets.filter((w) => w.isInstalled);

    const connectOP = useCallback(
        () => connectToWallet(SupportedWallets.OP_WALLET),
        [connectToWallet],
    );

    const connectUnisat = useCallback(
        () => connectToWallet(SupportedWallets.UNISAT),
        [connectToWallet],
    );

    /** Truncated address for display: bcrt1q...xyzw */
    const displayAddress = walletAddress
        ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`
        : '';

    return {
        // state
        isConnected,
        connecting,
        walletAddress,
        displayAddress,
        publicKey,
        network,
        walletBalance,
        walletProvider,
        signer,
        walletInstance,
        installedWallets,
        /** Proper Address object from wallet (includes MLDSA identity) */
        address,
        /** SHA256 hash of the wallet's MLDSA public key */
        hashedMLDSAKey,

        // actions
        openConnectModal,
        connectOP,
        connectUnisat,
        disconnect,
    };
}
