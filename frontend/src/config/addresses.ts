import { networks, Network } from '@btc-vision/bitcoin';

/** BAMPL contract address -- update after deployment */
export const BAMPL_CONTRACT_ADDRESS =
    'opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4';

/** MOTO token contract address on OPNet testnet */
export const MOTO_CONTRACT_ADDRESS =
    '0x0a6732489a31e6de07917a28ff7df311fc5f98f6e1664943ac1c3fe7893bdab5';

/** Active network configuration */
export const NETWORK: Network = networks.opnetTestnet;

/** JSON-RPC endpoint for OPNet testnet */
export const RPC_URL = 'https://testnet.opnet.org';

/** Token metadata constants */
export const BAMPL_DECIMALS = 8;
export const BAMPL_SYMBOL = 'BAMPL';
export const BAMPL_NAME = 'BitAmple';

/** Polling interval for data refresh (ms) */
export const POLL_INTERVAL_MS = 10_000;

/** Faucet API base URL (empty = relative path for Vercel, override via .env for local dev) */
export const FAUCET_URL =
    (import.meta.env.VITE_FAUCET_URL as string | undefined) || '';
