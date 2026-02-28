import { JSONRpcProvider } from 'opnet';
import { NETWORK, RPC_URL } from '../config/addresses';

/**
 * Singleton JSON-RPC provider for the OPNet testnet.
 *
 * Re-use a single instance across the entire application to avoid
 * redundant connections and duplicate request deduplication issues.
 */
let _provider: JSONRpcProvider | null = null;

export function getProvider(): JSONRpcProvider {
    if (!_provider) {
        _provider = new JSONRpcProvider({
            url: RPC_URL,
            network: NETWORK,
        });
    }
    return _provider;
}
