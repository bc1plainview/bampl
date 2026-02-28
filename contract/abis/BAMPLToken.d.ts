import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the name function call.
 */
export type Name = CallResult<
    {
        name: string;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the symbol function call.
 */
export type Symbol = CallResult<
    {
        symbol: string;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the decimals function call.
 */
export type Decimals = CallResult<
    {
        decimals: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the totalSupply function call.
 */
export type TotalSupply = CallResult<
    {
        totalSupply: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the balanceOf function call.
 */
export type BalanceOf = CallResult<
    {
        balance: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the scaledBalanceOf function call.
 */
export type ScaledBalanceOf = CallResult<
    {
        gonBalance: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the scaledTotalSupply function call.
 */
export type ScaledTotalSupply = CallResult<
    {
        scaledTotal: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the allowance function call.
 */
export type Allowance = CallResult<
    {
        remaining: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the transfer function call.
 */
export type Transfer = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the transferFrom function call.
 */
export type TransferFrom = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the transferAll function call.
 */
export type TransferAll = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the approve function call.
 */
export type Approve = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the increaseAllowance function call.
 */
export type IncreaseAllowance = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the decreaseAllowance function call.
 */
export type DecreaseAllowance = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the postPrice function call.
 */
export type PostPrice = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the rebase function call.
 */
export type Rebase = CallResult<
    {
        newTotalSupply: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the currentPrice function call.
 */
export type CurrentPrice = CallResult<
    {
        price: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the targetPrice function call.
 */
export type TargetPrice = CallResult<
    {
        target: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the currentEpoch function call.
 */
export type CurrentEpoch = CallResult<
    {
        epoch: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the nextRebaseBlock function call.
 */
export type NextRebaseBlock = CallResult<
    {
        blockHeight: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the canRebase function call.
 */
export type CanRebase = CallResult<
    {
        ready: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the gonsPerFragment function call.
 */
export type GonsPerFragment = CallResult<
    {
        gonsPerFragment: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the lastRebaseBlock function call.
 */
export type LastRebaseBlock = CallResult<
    {
        lastRebaseBlock: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the epochLength function call.
 */
export type EpochLength = CallResult<
    {
        epochLength: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the rebaseLag function call.
 */
export type RebaseLag = CallResult<
    {
        lag: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the deviationThreshold function call.
 */
export type DeviationThreshold = CallResult<
    {
        threshold: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setTargetPrice function call.
 */
export type SetTargetPrice = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setEpochLength function call.
 */
export type SetEpochLength = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setRebaseLag function call.
 */
export type SetRebaseLag = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setDeviationThreshold function call.
 */
export type SetDeviationThreshold = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the enableDemoMode function call.
 */
export type EnableDemoMode = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IBAMPLToken
// ------------------------------------------------------------------
export interface IBAMPLToken extends IOP_NETContract {
    name(): Promise<Name>;
    symbol(): Promise<Symbol>;
    decimals(): Promise<Decimals>;
    totalSupply(): Promise<TotalSupply>;
    balanceOf(owner: Address): Promise<BalanceOf>;
    scaledBalanceOf(owner: Address): Promise<ScaledBalanceOf>;
    scaledTotalSupply(): Promise<ScaledTotalSupply>;
    allowance(owner: Address, spender: Address): Promise<Allowance>;
    transfer(to: Address, amount: bigint): Promise<Transfer>;
    transferFrom(from: Address, to: Address, amount: bigint): Promise<TransferFrom>;
    transferAll(to: Address): Promise<TransferAll>;
    approve(spender: Address, amount: bigint): Promise<Approve>;
    increaseAllowance(spender: Address, addedValue: bigint): Promise<IncreaseAllowance>;
    decreaseAllowance(spender: Address, subtractedValue: bigint): Promise<DecreaseAllowance>;
    postPrice(price: bigint): Promise<PostPrice>;
    rebase(): Promise<Rebase>;
    currentPrice(): Promise<CurrentPrice>;
    targetPrice(): Promise<TargetPrice>;
    currentEpoch(): Promise<CurrentEpoch>;
    nextRebaseBlock(): Promise<NextRebaseBlock>;
    canRebase(): Promise<CanRebase>;
    gonsPerFragment(): Promise<GonsPerFragment>;
    lastRebaseBlock(): Promise<LastRebaseBlock>;
    epochLength(): Promise<EpochLength>;
    rebaseLag(): Promise<RebaseLag>;
    deviationThreshold(): Promise<DeviationThreshold>;
    setTargetPrice(newTarget: bigint): Promise<SetTargetPrice>;
    setEpochLength(newLength: bigint): Promise<SetEpochLength>;
    setRebaseLag(newLag: bigint): Promise<SetRebaseLag>;
    setDeviationThreshold(newThreshold: bigint): Promise<SetDeviationThreshold>;
    enableDemoMode(): Promise<EnableDemoMode>;
}
