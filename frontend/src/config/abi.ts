import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi } from 'opnet';

/**
 * Full ABI for the BAMPLToken contract.
 *
 * Includes standard OP20 methods (totalSupply, balanceOf, transfer, approve, etc.)
 * plus custom elastic-supply methods (rebase, postPrice, canRebase, currentPrice,
 * targetPrice, currentEpoch, gonsPerFragment, and admin setters).
 *
 * All method selectors are SHA256-based and auto-computed by the opnet SDK
 * from the method name strings defined here.
 */
export const BAMPL_ABI: BitcoinInterfaceAbi = [
    // -----------------------------------------------------------------------
    // Standard OP20 read methods
    // -----------------------------------------------------------------------
    {
        name: 'name',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'name', type: ABIDataTypes.STRING }],
    },
    {
        name: 'symbol',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'symbol', type: ABIDataTypes.STRING }],
    },
    {
        name: 'decimals',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'decimals', type: ABIDataTypes.UINT8 }],
    },
    {
        name: 'totalSupply',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'totalSupply', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'balanceOf',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'allowance',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'spender', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'remaining', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'scaledBalanceOf',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'scaledBalance', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'scaledTotalSupply',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'scaledTotalSupply', type: ABIDataTypes.UINT256 }],
    },

    // -----------------------------------------------------------------------
    // Standard OP20 write methods
    // -----------------------------------------------------------------------
    {
        name: 'transfer',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    {
        name: 'transferFrom',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'from', type: ABIDataTypes.ADDRESS },
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    {
        name: 'approve',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    {
        name: 'increaseAllowance',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    {
        name: 'decreaseAllowance',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    {
        name: 'transferAll',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'to', type: ABIDataTypes.ADDRESS }],
        outputs: [],
    },

    // -----------------------------------------------------------------------
    // BAMPL elastic-supply read methods
    // -----------------------------------------------------------------------
    {
        name: 'currentPrice',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'targetPrice',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'target', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'currentEpoch',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'epoch', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'nextRebaseBlock',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'blockHeight', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'canRebase',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'allowed', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'gonsPerFragment',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'gonsPerFragment', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'lastRebaseBlock',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'blockHeight', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'epochLength',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'length', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'rebaseLag',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'lag', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'deviationThreshold',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'threshold', type: ABIDataTypes.UINT256 }],
    },

    // -----------------------------------------------------------------------
    // BAMPL elastic-supply write methods
    // -----------------------------------------------------------------------
    {
        name: 'rebase',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [{ name: 'newSupply', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'postPrice',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },

    // -----------------------------------------------------------------------
    // Admin / configuration write methods
    // -----------------------------------------------------------------------
    {
        name: 'enableDemoMode',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [],
    },
    {
        name: 'setTargetPrice',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'newTarget', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'setEpochLength',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'newLength', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'setRebaseLag',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'newLag', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'setDeviationThreshold',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'newThreshold', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------
    {
        name: 'Rebase',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'epoch', type: ABIDataTypes.UINT256 },
            { name: 'newSupply', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'PricePosted',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'price', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'Transferred',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'operator', type: ABIDataTypes.ADDRESS },
            { name: 'from', type: ABIDataTypes.ADDRESS },
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'Approved',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },
];
