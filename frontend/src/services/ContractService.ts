import { getContract } from 'opnet';
import { BAMPL_ABI } from '../config/abi';
import { BAMPL_CONTRACT_ADDRESS, NETWORK } from '../config/addresses';
import { getProvider } from './ProviderService';

/**
 * Cached BAMPL contract instance.
 *
 * We use the custom BAMPL_ABI (which extends OP20 with elastic-supply
 * methods) together with `getContract`. The returned contract object
 * exposes every ABI-defined method as a callable function.
 *
 * Custom methods (rebase, postPrice, etc.) are accessed dynamically
 * via the contract instance since they are defined in BAMPL_ABI.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _bamplContract: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBAMPLContract(): any {
    if (!_bamplContract) {
        const provider = getProvider();
        _bamplContract = getContract(
            BAMPL_CONTRACT_ADDRESS,
            BAMPL_ABI,
            provider,
            NETWORK,
        );
    }
    return _bamplContract;
}

/**
 * Invalidate the cached contract instance.
 * Call this if the provider or address changes at runtime.
 */
export function resetBAMPLContract(): void {
    _bamplContract = null;
}
