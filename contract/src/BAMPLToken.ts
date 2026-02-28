import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    OP_NET,
    Blockchain,
    Address,
    Calldata,
    BytesWriter,
    SafeMath,
    Revert,
    StoredU256,
    AddressMemoryMap,
    MapOfMap,
    Nested,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';

/**
 * BAMPL — Ampleforth elastic supply fork on OPNet (Bitcoin L1).
 *
 * Gons accounting: a fixed internal denomination (TOTAL_GONS) is divided by
 * a floating _gonsPerFragment to derive visible balances.  Rebase changes
 * only _gonsPerFragment in O(1); individual gon balances never change
 * except on transfer.
 *
 * Monetary policy is built-in (single-contract design).
 * Oracle operator posts BAMPL/MOTO VWAP; anyone can trigger rebase()
 * once per epoch.  Linear formula with lag (matches AMPL v1 launch).
 */
@final
export class BAMPLToken extends OP_NET {
    // ────────────────────────────────────────────────────────────────────
    //  COMPILE-TIME CONSTANTS
    // ────────────────────────────────────────────────────────────────────

    /** 50 000 000 tokens * 10^8 decimals */
    private static readonly INITIAL_SUPPLY: u256 = u256.fromString('5000000000000000');

    /**
     * Fixed total gons. Chosen as INITIAL_SUPPLY * 10^61 so that:
     *  - gonsPerFragment starts at 10^61  (huge precision)
     *  - at MAX_SUPPLY (~3.4e38) gonsPerFragment is still ~1.5e38
     *  - amount * gonsPerFragment never exceeds u256.MAX
     * Exactly divisible by INITIAL_SUPPLY (no rounding at init).
     */
    private static readonly TOTAL_GONS: u256 = u256.fromString(
        '50000000000000000000000000000000000000000000000000000000000000000000000000000',
    );

    /** 2^128 − 1 */
    private static readonly MAX_SUPPLY: u256 = u256.fromString(
        '340282366920938463463374607431768211455',
    );

    /** Floor: supply can never contract below 1 BAMPL (10^8 raw). */
    private static readonly MIN_SUPPLY: u256 = u256.fromString('100000000');

    /** 10^8 — basis for 8-decimal fixed-point percentages and prices. */
    private static readonly PRECISION: u256 = u256.fromString('100000000');

    // ────────────────────────────────────────────────────────────────────
    //  STORAGE  (pointer allocation order is immutable across upgrades)
    // ────────────────────────────────────────────────────────────────────

    // --- core token state ---
    private readonly p_totalSupply: u16 = Blockchain.nextPointer;
    private readonly p_gonsPerFragment: u16 = Blockchain.nextPointer;
    private readonly p_gonBalances: u16 = Blockchain.nextPointer;
    private readonly p_allowances: u16 = Blockchain.nextPointer;

    // --- monetary policy ---
    private readonly p_targetPrice: u16 = Blockchain.nextPointer;
    private readonly p_oraclePrice: u16 = Blockchain.nextPointer;
    private readonly p_lastRebaseBlock: u16 = Blockchain.nextPointer;
    private readonly p_epochLength: u16 = Blockchain.nextPointer;
    private readonly p_epoch: u16 = Blockchain.nextPointer;
    private readonly p_rebaseLag: u16 = Blockchain.nextPointer;
    private readonly p_deviationThreshold: u16 = Blockchain.nextPointer;
    private readonly p_maxExpansionRate: u16 = Blockchain.nextPointer;
    private readonly p_maxContractionRate: u16 = Blockchain.nextPointer;
    private readonly p_lastOracleBlock: u16 = Blockchain.nextPointer;

    // --- storage instances (initialized inline to satisfy strict init) ---
    private _totalSupply!: StoredU256;
    private _gonsPerFragment!: StoredU256;
    private _gonBalances!: AddressMemoryMap;
    private _allowances!: MapOfMap<u256>;

    private _targetPrice!: StoredU256;
    private _oraclePrice!: StoredU256;
    private _lastRebaseBlock!: StoredU256;
    private _epochLength!: StoredU256;
    private _epoch!: StoredU256;
    private _rebaseLag!: StoredU256;
    private _deviationThreshold!: StoredU256;
    private _maxExpansionRate!: StoredU256;
    private _maxContractionRate!: StoredU256;
    private _lastOracleBlock!: StoredU256;

    // ────────────────────────────────────────────────────────────────────
    //  CONSTRUCTOR
    // ────────────────────────────────────────────────────────────────────

    public constructor() {
        super();

        this._totalSupply = new StoredU256(this.p_totalSupply, EMPTY_POINTER);
        this._gonsPerFragment = new StoredU256(this.p_gonsPerFragment, EMPTY_POINTER);
        this._gonBalances = new AddressMemoryMap(this.p_gonBalances);
        this._allowances = new MapOfMap<u256>(this.p_allowances);

        this._targetPrice = new StoredU256(this.p_targetPrice, EMPTY_POINTER);
        this._oraclePrice = new StoredU256(this.p_oraclePrice, EMPTY_POINTER);
        this._lastRebaseBlock = new StoredU256(this.p_lastRebaseBlock, EMPTY_POINTER);
        this._epochLength = new StoredU256(this.p_epochLength, EMPTY_POINTER);
        this._epoch = new StoredU256(this.p_epoch, EMPTY_POINTER);
        this._rebaseLag = new StoredU256(this.p_rebaseLag, EMPTY_POINTER);
        this._deviationThreshold = new StoredU256(this.p_deviationThreshold, EMPTY_POINTER);
        this._maxExpansionRate = new StoredU256(this.p_maxExpansionRate, EMPTY_POINTER);
        this._maxContractionRate = new StoredU256(this.p_maxContractionRate, EMPTY_POINTER);
        this._lastOracleBlock = new StoredU256(this.p_lastOracleBlock, EMPTY_POINTER);
    }

    // ────────────────────────────────────────────────────────────────────
    //  LIFECYCLE
    // ────────────────────────────────────────────────────────────────────

    public override onDeployment(_calldata: Calldata): void {
        // Token state
        this._totalSupply.set(BAMPLToken.INITIAL_SUPPLY);
        this._gonsPerFragment.set(
            SafeMath.div(BAMPLToken.TOTAL_GONS, BAMPLToken.INITIAL_SUPPLY),
        );

        // All gons to deployer
        this._gonBalances.set(Blockchain.tx.sender, BAMPLToken.TOTAL_GONS);

        // Monetary policy defaults
        this._targetPrice.set(BAMPLToken.PRECISION); // 1 MOTO = 1e8
        this._oraclePrice.set(BAMPLToken.PRECISION); // start at peg
        this._epochLength.set(u256.fromU32(144)); // ~1 day
        this._rebaseLag.set(u256.fromU32(10));
        this._deviationThreshold.set(u256.fromString('5000000')); // 5%
        this._maxExpansionRate.set(u256.fromString('5000000')); // 5%
        this._maxContractionRate.set(u256.fromString('7700000')); // 7.7%
        this._lastRebaseBlock.set(u256.fromU64(Blockchain.block.number));
        this._epoch.set(u256.Zero);
    }

    // ════════════════════════════════════════════════════════════════════
    //  OP20-COMPATIBLE  READ METHODS
    // ════════════════════════════════════════════════════════════════════

    @view
    @method()
    @returns({ name: 'name', type: ABIDataTypes.STRING })
    public name(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(14);
        writer.writeStringWithLength('BitAmple');
        return writer;
    }

    @view
    @method()
    @returns({ name: 'symbol', type: ABIDataTypes.STRING })
    public symbol(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(10);
        writer.writeStringWithLength('BAMPL');
        return writer;
    }

    @view
    @method()
    @returns({ name: 'decimals', type: ABIDataTypes.UINT8 })
    public decimals(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeU8(8);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'totalSupply', type: ABIDataTypes.UINT256 })
    public totalSupply(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._totalSupply.value);
        return writer;
    }

    @view
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'balance', type: ABIDataTypes.UINT256 })
    public balanceOf(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const balance: u256 = this._fragmentBalance(owner);
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(balance);
        return writer;
    }

    @view
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'gonBalance', type: ABIDataTypes.UINT256 })
    public scaledBalanceOf(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._gonBalances.get(owner));
        return writer;
    }

    @view
    @method()
    @returns({ name: 'scaledTotal', type: ABIDataTypes.UINT256 })
    public scaledTotalSupply(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(BAMPLToken.TOTAL_GONS);
        return writer;
    }

    @view
    @method(
        { name: 'owner', type: ABIDataTypes.ADDRESS },
        { name: 'spender', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'remaining', type: ABIDataTypes.UINT256 })
    public allowance(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const spender: Address = calldata.readAddress();
        const ownerMap: Nested<u256> = this._allowances.get(owner);
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(ownerMap.get(spender));
        return writer;
    }

    // ════════════════════════════════════════════════════════════════════
    //  OP20-COMPATIBLE  WRITE METHODS
    // ════════════════════════════════════════════════════════════════════

    @method(
        { name: 'to', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public transfer(calldata: Calldata): BytesWriter {
        const to: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();
        this._transferFragments(Blockchain.tx.sender, to, amount);
        return new BytesWriter(0);
    }

    @method(
        { name: 'from', type: ABIDataTypes.ADDRESS },
        { name: 'to', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public transferFrom(calldata: Calldata): BytesWriter {
        const from: Address = calldata.readAddress();
        const to: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();
        this._spendAllowance(from, Blockchain.tx.sender, amount);
        this._transferFragments(from, to, amount);
        return new BytesWriter(0);
    }

    /** Transfer entire gon balance (avoids rounding dust). */
    @method({ name: 'to', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public transferAll(calldata: Calldata): BytesWriter {
        const to: Address = calldata.readAddress();
        const sender: Address = Blockchain.tx.sender;
        const senderGons: u256 = this._gonBalances.get(sender);

        if (u256.eq(senderGons, u256.Zero)) {
            throw new Revert('Zero balance');
        }

        this._gonBalances.set(sender, u256.Zero);
        this._gonBalances.set(to, SafeMath.add(this._gonBalances.get(to), senderGons));

        return new BytesWriter(0);
    }

    @method(
        { name: 'spender', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public approve(calldata: Calldata): BytesWriter {
        const spender: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();
        this._setAllowance(Blockchain.tx.sender, spender, amount);
        return new BytesWriter(0);
    }

    @method(
        { name: 'spender', type: ABIDataTypes.ADDRESS },
        { name: 'addedValue', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public increaseAllowance(calldata: Calldata): BytesWriter {
        const spender: Address = calldata.readAddress();
        const addedValue: u256 = calldata.readU256();
        const owner: Address = Blockchain.tx.sender;
        const current: u256 = this._getAllowance(owner, spender);
        this._setAllowance(owner, spender, SafeMath.add(current, addedValue));
        return new BytesWriter(0);
    }

    @method(
        { name: 'spender', type: ABIDataTypes.ADDRESS },
        { name: 'subtractedValue', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public decreaseAllowance(calldata: Calldata): BytesWriter {
        const spender: Address = calldata.readAddress();
        const subtractedValue: u256 = calldata.readU256();
        const owner: Address = Blockchain.tx.sender;
        const current: u256 = this._getAllowance(owner, spender);
        if (u256.lt(current, subtractedValue)) {
            throw new Revert('Allowance underflow');
        }
        this._setAllowance(owner, spender, SafeMath.sub(current, subtractedValue));
        return new BytesWriter(0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  MONETARY POLICY — ORACLE
    // ════════════════════════════════════════════════════════════════════

    /**
     * Post the current BAMPL/MOTO VWAP price.
     * Only the deployer (oracle operator) may call this.
     * Price is in 8-decimal fixed-point (1 MOTO = 1e8).
     */
    @method({ name: 'price', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public postPrice(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        const price: u256 = calldata.readU256();

        if (u256.eq(price, u256.Zero)) {
            throw new Revert('Price cannot be zero');
        }

        this._oraclePrice.set(price);
        this._lastOracleBlock.set(u256.fromU64(Blockchain.block.number));

        return new BytesWriter(0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  MONETARY POLICY — REBASE
    // ════════════════════════════════════════════════════════════════════

    /**
     * Trigger a supply rebase.  Permissionless — anyone may call, but
     * the epoch must have elapsed and an oracle price must be posted.
     *
     * Returns the new total supply.
     */
    @method()
    @returns({ name: 'newTotalSupply', type: ABIDataTypes.UINT256 })
    public rebase(_calldata: Calldata): BytesWriter {
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const lastBlock: u256 = this._lastRebaseBlock.value;
        const epochLen: u256 = this._epochLength.value;

        // Epoch must have elapsed
        if (u256.lt(currentBlock, SafeMath.add(lastBlock, epochLen))) {
            throw new Revert('Epoch not elapsed');
        }

        const oraclePrice: u256 = this._oraclePrice.value;
        const targetPrice: u256 = this._targetPrice.value;

        if (u256.eq(oraclePrice, u256.Zero)) {
            throw new Revert('No oracle price');
        }

        // Check deviation threshold
        let supplyDelta: u256 = u256.Zero;
        let isExpansion: bool = true;

        if (u256.gt(oraclePrice, targetPrice)) {
            // Price above peg — potential expansion
            const deviation: u256 = SafeMath.sub(oraclePrice, targetPrice);
            const thresholdAmt: u256 = SafeMath.div(
                SafeMath.mul(targetPrice, this._deviationThreshold.value),
                BAMPLToken.PRECISION,
            );

            if (u256.gt(deviation, thresholdAmt)) {
                isExpansion = true;
                supplyDelta = this._computeSupplyDelta(deviation, targetPrice);
                supplyDelta = this._capDelta(supplyDelta, this._maxExpansionRate.value);
            }
        } else if (u256.lt(oraclePrice, targetPrice)) {
            // Price below peg — potential contraction
            const deviation: u256 = SafeMath.sub(targetPrice, oraclePrice);
            const thresholdAmt: u256 = SafeMath.div(
                SafeMath.mul(targetPrice, this._deviationThreshold.value),
                BAMPLToken.PRECISION,
            );

            if (u256.gt(deviation, thresholdAmt)) {
                isExpansion = false;
                supplyDelta = this._computeSupplyDelta(deviation, targetPrice);
                supplyDelta = this._capDelta(supplyDelta, this._maxContractionRate.value);
            }
        }

        // Apply supply change
        let newSupply: u256 = this._totalSupply.value;

        if (!u256.eq(supplyDelta, u256.Zero)) {
            if (isExpansion) {
                newSupply = SafeMath.add(newSupply, supplyDelta);
                if (u256.gt(newSupply, BAMPLToken.MAX_SUPPLY)) {
                    newSupply = BAMPLToken.MAX_SUPPLY;
                }
            } else {
                if (u256.gt(supplyDelta, SafeMath.sub(newSupply, BAMPLToken.MIN_SUPPLY))) {
                    newSupply = BAMPLToken.MIN_SUPPLY;
                } else {
                    newSupply = SafeMath.sub(newSupply, supplyDelta);
                }
            }

            this._totalSupply.set(newSupply);
            this._gonsPerFragment.set(SafeMath.div(BAMPLToken.TOTAL_GONS, newSupply));
        }

        // Update epoch bookkeeping
        this._epoch.set(SafeMath.add(this._epoch.value, u256.One));
        this._lastRebaseBlock.set(currentBlock);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(newSupply);
        return writer;
    }

    // ════════════════════════════════════════════════════════════════════
    //  MONETARY POLICY — VIEW HELPERS
    // ════════════════════════════════════════════════════════════════════

    @view
    @method()
    @returns({ name: 'price', type: ABIDataTypes.UINT256 })
    public currentPrice(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._oraclePrice.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'target', type: ABIDataTypes.UINT256 })
    public targetPrice(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._targetPrice.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'epoch', type: ABIDataTypes.UINT256 })
    public currentEpoch(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._epoch.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'blockHeight', type: ABIDataTypes.UINT256 })
    public nextRebaseBlock(_calldata: Calldata): BytesWriter {
        const next: u256 = SafeMath.add(
            this._lastRebaseBlock.value,
            this._epochLength.value,
        );
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(next);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'ready', type: ABIDataTypes.BOOL })
    public canRebase(_calldata: Calldata): BytesWriter {
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const threshold: u256 = SafeMath.add(
            this._lastRebaseBlock.value,
            this._epochLength.value,
        );
        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(u256.ge(currentBlock, threshold));
        return writer;
    }

    @view
    @method()
    @returns({ name: 'gonsPerFragment', type: ABIDataTypes.UINT256 })
    public gonsPerFragment(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._gonsPerFragment.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'lastRebaseBlock', type: ABIDataTypes.UINT256 })
    public lastRebaseBlock(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._lastRebaseBlock.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'epochLength', type: ABIDataTypes.UINT256 })
    public epochLength(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._epochLength.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'lag', type: ABIDataTypes.UINT256 })
    public rebaseLag(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._rebaseLag.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'threshold', type: ABIDataTypes.UINT256 })
    public deviationThreshold(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this._deviationThreshold.value);
        return writer;
    }

    // ════════════════════════════════════════════════════════════════════
    //  ADMIN (deployer-only)
    // ════════════════════════════════════════════════════════════════════

    @method({ name: 'newTarget', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setTargetPrice(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        const newTarget: u256 = calldata.readU256();
        if (u256.eq(newTarget, u256.Zero)) throw new Revert('Zero target');
        this._targetPrice.set(newTarget);
        return new BytesWriter(0);
    }

    @method({ name: 'newLength', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setEpochLength(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        const newLength: u256 = calldata.readU256();
        if (u256.eq(newLength, u256.Zero)) throw new Revert('Zero epoch');
        this._epochLength.set(newLength);
        return new BytesWriter(0);
    }

    @method({ name: 'newLag', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setRebaseLag(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        const newLag: u256 = calldata.readU256();
        if (u256.eq(newLag, u256.Zero)) throw new Revert('Zero lag');
        this._rebaseLag.set(newLag);
        return new BytesWriter(0);
    }

    @method({ name: 'newThreshold', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setDeviationThreshold(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this._deviationThreshold.set(calldata.readU256());
        return new BytesWriter(0);
    }

    /** For demo: set epoch length to 1 block so rebase triggers immediately. */
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public enableDemoMode(_calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        this._epochLength.set(u256.One);
        this._rebaseLag.set(u256.fromU32(2)); // faster corrections for demo
        return new BytesWriter(0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  INTERNAL — TOKEN MECHANICS
    // ════════════════════════════════════════════════════════════════════

    /** Fragment balance = gonBalance / gonsPerFragment */
    private _fragmentBalance(owner: Address): u256 {
        const gons: u256 = this._gonBalances.get(owner);
        if (u256.eq(gons, u256.Zero)) return u256.Zero;
        return SafeMath.div(gons, this._gonsPerFragment.value);
    }

    /** Transfer fragment amount (converts to gons internally). */
    private _transferFragments(from: Address, to: Address, fragmentAmount: u256): void {
        if (u256.eq(fragmentAmount, u256.Zero)) {
            throw new Revert('Zero transfer');
        }

        const gonValue: u256 = SafeMath.mul(fragmentAmount, this._gonsPerFragment.value);
        const fromGons: u256 = this._gonBalances.get(from);

        if (u256.lt(fromGons, gonValue)) {
            throw new Revert('Insufficient balance');
        }

        this._gonBalances.set(from, SafeMath.sub(fromGons, gonValue));
        this._gonBalances.set(to, SafeMath.add(this._gonBalances.get(to), gonValue));
    }

    private _getAllowance(owner: Address, spender: Address): u256 {
        const ownerMap: Nested<u256> = this._allowances.get(owner);
        return ownerMap.get(spender);
    }

    private _setAllowance(owner: Address, spender: Address, amount: u256): void {
        const ownerMap: Nested<u256> = this._allowances.get(owner);
        ownerMap.set(spender, amount);
        this._allowances.set(owner, ownerMap);
    }

    private _spendAllowance(owner: Address, spender: Address, amount: u256): void {
        const current: u256 = this._getAllowance(owner, spender);
        // u256.MAX = unlimited allowance (skip deduction)
        if (!u256.eq(current, u256.Max)) {
            if (u256.lt(current, amount)) {
                throw new Revert('Allowance exceeded');
            }
            this._setAllowance(owner, spender, SafeMath.sub(current, amount));
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  INTERNAL — REBASE MATH
    // ════════════════════════════════════════════════════════════════════

    /**
     * Linear supply delta (AMPL v1 formula):
     *   delta = totalSupply * deviation / targetPrice / rebaseLag
     *
     * Multiply-first ordering avoids precision loss.
     */
    private _computeSupplyDelta(deviation: u256, targetPrice: u256): u256 {
        const totalSupply: u256 = this._totalSupply.value;
        const lag: u256 = this._rebaseLag.value;

        // totalSupply * deviation  (safe: both bounded well below u256.MAX)
        const numerator: u256 = SafeMath.mul(totalSupply, deviation);
        // numerator / targetPrice / lag
        return SafeMath.div(SafeMath.div(numerator, targetPrice), lag);
    }

    /** Clamp delta to maxRate% of current supply. */
    private _capDelta(delta: u256, maxRate: u256): u256 {
        const maxDelta: u256 = SafeMath.div(
            SafeMath.mul(this._totalSupply.value, maxRate),
            BAMPLToken.PRECISION,
        );

        if (u256.gt(delta, maxDelta)) {
            return maxDelta;
        }
        return delta;
    }
}
