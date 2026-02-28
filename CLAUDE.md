# BAMPL (BitAmple) - Elastic Supply Token on OPNet

## Project Overview

BAMPL is an Ampleforth-style elastic supply token deployed on OPNet (Bitcoin L1 smart contract platform). The supply expands when price is above target and contracts when below, keeping each holder's percentage ownership constant.

- **Contract Address**: `opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4`
- **Network**: OPNet Testnet (Signet fork) — `https://testnet.opnet.org`
- **Deployer P2TR**: `opt1pfmn8j0lfufc8askgjfkl8jp5z045pnjd94tx2s9x6rq3nrxl6syqadhlf4`

---

## STRICT RULES (MUST FOLLOW — VIOLATIONS CAUSE FAILURES)

### Rule 1: Pin opnet SDK to `1.8.1-rc.12`

**NEVER use any other version.** Both `rc.14` and `rc.15` are confirmed broken — they cause "Could not decode transaction" errors after 1-2 TXs.

```json
{
  "dependencies": {
    "opnet": "1.8.1-rc.12"
  }
}
```

Even `rc.12` has intermittent failures after ~5-6 TXs in rapid succession. If you hit "Could not decode transaction", wait 1-2 blocks and try again. Do NOT upgrade the SDK to try to fix it.

**Incident reports**: INC-mm3ulg2o-07b4d4 (rc.15), INC-mm3x46ju-75cfc2 (rc.14).

### Rule 2: ALWAYS Override `@noble/hashes` to `2.0.1`

Every `package.json` must include:

```json
{
  "overrides": {
    "@noble/hashes": "2.0.1"
  }
}
```

Without this, crypto operations silently fail or produce wrong results.

### Rule 3: Use `networks.opnetTestnet` — NEVER `networks.testnet`

```typescript
import { networks } from '@btc-vision/bitcoin';
const NETWORK = networks.opnetTestnet; // CORRECT — OPNet Signet fork
// networks.testnet is Testnet4, which OPNet does NOT support
```

### Rule 4: `Address` Objects, NOT Strings, for Contract Calls

`contract.balanceOf()`, `contract.transfer()`, and ALL methods that take an address parameter require an `Address` object — NOT a bech32 string.

**WRONG (silently fails or returns 0):**
```typescript
const balance = await contract.balanceOf(walletAddress); // walletAddress is a string
```

**CORRECT:**
```typescript
import { Address } from '@btc-vision/transaction';
const provider = getProvider();
const addr: Address = await provider.getPublicKeyInfo(bech32Address, false);
const balance = await contract.balanceOf(addr);
```

Key details:
- `getPublicKeyInfo()` takes **2 arguments**: `(address: string, isContract: boolean)`
- The second argument must be `false` for wallet addresses, `true` for contract addresses
- Returns an `Address` object that contains both the ML-DSA hashed key and tweaked pubkey
- Cache the resolved `Address` to avoid re-resolving every call

### Rule 5: One Rebase Per Block — NEVER Rapid-Fire

OPNet enforces `epochLength` — only ONE rebase can execute per block period. If you send multiple rebases in the same block, ALL of them will revert and you burn fees for nothing.

**Correct pattern for demo/testing:**
1. Send TX (postPrice or rebase)
2. Wait for the next block (~10 minutes on testnet)
3. Send next TX
4. Repeat

Use `provider.getBlockNumber()` to poll for new blocks. Do NOT send rapid-fire TXs hoping they'll be in different blocks.

### Rule 6: Frontend Signing — signer=null, mldsaSigner=null

On the frontend, the wallet extension handles signing. NEVER pass signer objects.

```typescript
// FRONTEND
const receipt = await sim.sendTransaction({
    signer: null,
    mldsaSigner: null,
    refundTo: walletAddress,
    maximumAllowedSatToSpend: 100_000n,
    network: NETWORK,
});
```

```typescript
// BACKEND (scripts)
const receipt = await sim.sendTransaction({
    signer: wallet.keypair,        // REQUIRED
    mldsaSigner: wallet.mldsaKeypair,  // REQUIRED
    from: wallet.address,
    refundTo: wallet.p2tr,
    utxos,
    challenge,
    feeRate: 50,
    priorityFee: 50_000n,
    maximumAllowedSatToSpend: 500_000n,
    network: NETWORK,
});
```

### Rule 7: NEVER Use Raw PSBT Construction

No `new Psbt()`, no `Psbt.fromBase64()`, no manual PSBT construction. FORBIDDEN.

- For **contract calls**: Use `getContract()` from `opnet` package -> simulate -> `sendTransaction()`
- For **BTC transfers**: Use `TransactionFactory` from `@btc-vision/transaction`
- `@btc-vision/transaction` is ONLY for `TransactionFactory` (deployments, BTC transfers). Using it for contract calls is PROHIBITED.

### Rule 8: Silent `.catch(() => null)` Hides Real Errors

When polling contract state, `.catch(() => null)` is fine for resilience. But when debugging, ALWAYS temporarily remove catch blocks to see the actual error.

The wallet balance bug was hidden for hours because `.catch(() => null)` silently swallowed the "Address is not an Address object" error.

### Rule 9: `eslint` Must Be Pinned to `^9.0.0`

The latest eslint (v9.27+) has breaking changes with `typescript-eslint`. Pin to `^9.0.0`:

```json
{
  "devDependencies": {
    "eslint": "^9.0.0"
  }
}
```

### Rule 10: Node Path Must Be Explicit

Node is installed at `/Users/dannyplainview/.local/node/bin/node` (v22.14.0). Always prefix commands:

```bash
export PATH="/Users/dannyplainview/.local/node/bin:$PATH"
```

---

## PROBLEMS ENCOUNTERED & RESOLUTIONS

### Problem 1: "Could not decode transaction" (CRITICAL — PARTIALLY UNRESOLVED)

**Symptoms:**
- Funding TXs always succeed (11 peers acknowledge)
- Interaction TXs (rebase, transfer, postPrice) rejected by node
- Works for first N transactions, then fails for ALL subsequent
- Other users' TXs work fine during same period

**What we tried:**
- opnet@1.8.1-rc.15: Broken immediately (known issue INC-mm3ulg2o-07b4d4)
- opnet@1.8.1-rc.14: Works for ~2 TXs then breaks (filed INC-mm3x46ju-75cfc2)
- opnet@1.8.1-rc.12: Works for ~5-6 TXs then breaks
- Clean `rm -rf node_modules && npm install`: No improvement
- Different contract methods (rebase, transfer, postPrice): All fail equally
- Debug scripts with step-by-step signing: Confirmed signing works, broadcast fails

**Resolution:** Pin to `rc.12` for best results. Accept that after ~5-6 TXs, you may need to wait 1-2 blocks before the next TX works. This appears to be a node-side issue (possibly challenge epoch rotation or protobuf schema caching).

**Root cause theory:** The error is stateful/accumulative. Something in the SDK or node accumulates state across transactions that eventually causes serialization failures. A fresh process or waiting for new blocks seems to reset it.

### Problem 2: Wallet Balance Showing 0

**Symptom:** User sent 10M BAMPL to their address. Balance confirmed via RPC script. But the frontend showed 0 when wallet was connected.

**Root cause:** `contract.balanceOf(walletAddress)` was passing a raw bech32 string. The method expects an `Address` object. The `.catch(() => null)` silently swallowed the error, so it fell through to the default value of `0n`.

**Resolution:** Added `resolveWalletAddress()` that calls `provider.getPublicKeyInfo(bech32Addr, false)` to convert the bech32 string to a proper `Address` object. Cached the result in a ref to avoid re-resolving every poll cycle. See `src/hooks/useBAMPL.ts`.

### Problem 3: Rapid-Fire Demo TXs All Reverted

**Symptom:** Sent 20 TXs rapidly (price posts + rebases). All accepted by 11 peers. ALL reverted in the same block. Burned ~0.014 BTC in fees for nothing.

**Root cause:** OPNet only allows one state change per epoch. When multiple TXs land in the same block, only the first executes — the rest revert. Even with `epochLength=1`, you still need one block between rebases.

**Resolution:** Created `demo-interactive.ts` that waits for block confirmations between each step. Pattern: send TX -> poll `getBlockNumber()` until next block -> read state -> send next TX.

### Problem 4: ML-DSA Key Linking

**Symptom:** Initial contract interactions failed because the deployer wallet didn't have ML-DSA keys linked on-chain.

**Resolution:** Used multiple iterations of `link-mldsa-*.ts` scripts. The final working approach (`link-mldsa-v8.ts`) used `TransactionFactory` to create a proper ML-DSA key registration transaction. Had to wait for block confirmation after linking before contract interactions would work.

### Problem 5: TypeScript Strict Mode Errors

**Symptoms:** Array index access (`arr[0]`, `arr[arr.length-1]`) flagged as possibly undefined under strict noUncheckedIndexedAccess.

**Resolution:**
```typescript
// WRONG
const first = points[0]; // Type: T | undefined

// CORRECT
const first = points[0];
if (!first) return;
// Now first is narrowed to T
```

For formatters:
```typescript
const whole = parts[0] ?? '';
```

### Problem 6: `getPublicKeyInfo` Argument Count

**Symptom:** `TS2554: Expected 2 arguments, but got 1` when calling `provider.getPublicKeyInfo(addr)`.

**Resolution:** In rc.12, the method signature is `getPublicKeyInfo(address: string, isContract: boolean)`. Always pass the second argument: `false` for wallet addresses, `true` for contracts.

### Problem 7: UTXO Split Failure

**Symptom:** Tried to split a large UTXO into many smaller ones using `TransactionFactory.createBTCTransfer` with `extraOutputs`. Broadcast failed with "Could not broadcast transaction".

**Resolution:** Abandoned the split approach. Instead, relied on change UTXOs from previous transactions. The mempool provider (`OPNetLimitedProvider.fetchUTXO`) can see unconfirmed change outputs, so chaining works without splitting.

---

## PROJECT STRUCTURE

```
bampl/
  contract/          # Smart contract source (AssemblyScript)
  frontend/          # React + Vite dashboard
    src/
      components/    # UI components (LiveStatus, PriceGauge, YourSlice, etc.)
      config/        # addresses.ts, abi.ts
      hooks/         # useBAMPL.ts (primary data hook), useWallet.ts
      services/      # ContractService.ts, ProviderService.ts
      styles/        # globals.css (all styles)
      utils/         # formatters.ts, sparkline.ts
  scripts/           # Deployment, demo, and utility scripts
    .env             # DEPLOYER_MNEMONIC, BAMPL_CONTRACT_ADDRESS, RPC_URL
    bampl-abi.ts     # Contract ABI definition
    demo-interactive.ts  # THE CORRECT demo script (waits for blocks)
    demo-livestream.ts   # FLAWED demo (rapid-fire, all reverts)
```

## KEY FILES

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useBAMPL.ts` | Primary data hook — polls all contract state, handles wallet balance resolution |
| `frontend/src/config/addresses.ts` | Contract address, network config, RPC URL |
| `frontend/src/services/ContractService.ts` | Cached `getContract()` instance |
| `frontend/src/services/ProviderService.ts` | Singleton `JSONRpcProvider` |
| `scripts/demo-interactive.ts` | Correct demo script (block-aware) |
| `scripts/bampl-abi.ts` | Contract ABI with elastic supply methods |
| `scripts/package.json` | SDK version pins (opnet@1.8.1-rc.12) |

## ENVIRONMENT VARIABLES (scripts/.env)

```
DEPLOYER_MNEMONIC=<24-word mnemonic>
BAMPL_CONTRACT_ADDRESS=opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4
RPC_URL=https://testnet.opnet.org
```

## SDK DEPENDENCY MATRIX

| Package | Version | Notes |
|---------|---------|-------|
| `opnet` | `1.8.1-rc.12` | PINNED. rc.13+ is broken. |
| `@btc-vision/transaction` | `rc` | Tracks latest RC |
| `@btc-vision/bitcoin` | `rc` | Must use `networks.opnetTestnet` |
| `@btc-vision/ecpair` | `latest` | Keypair generation |
| `@btc-vision/bip32` | `latest` | HD key derivation |
| `@btc-vision/walletconnect` | `latest` | Frontend wallet connection |
| `@noble/hashes` | `2.0.1` | OVERRIDE in package.json |
| `eslint` | `^9.0.0` | PINNED. v9.27+ breaks typescript-eslint |

## QUICK REFERENCE: Contract Interaction Pattern

```typescript
import { getContract, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: NETWORK });
const contract = getContract(CONTRACT_ADDRESS, ABI, provider, NETWORK);

// READ (no TX needed)
const result = await contract.totalSupply();
const value = result.properties.totalSupply;

// WRITE (backend)
const sim = await contract.rebase();
if (!sim?.calldata) throw new Error('Simulation failed');
const receipt = await sim.sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    from: wallet.address,
    refundTo: wallet.p2tr,
    utxos: await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n }),
    challenge: await provider.getChallenge(),
    feeRate: 50,
    priorityFee: 50_000n,
    maximumAllowedSatToSpend: 500_000n,
    network: NETWORK,
});

// WRITE (frontend — wallet signs)
const sim = await contract.rebase();
const receipt = await sim.sendTransaction({
    signer: null,
    mldsaSigner: null,
    refundTo: walletAddress,
    maximumAllowedSatToSpend: 100_000n,
    network: NETWORK,
});
```

## DEMO RESULTS (Blocks 2333-2338)

| Step | Action | Result |
|------|--------|--------|
| 1 | Post price 3.00 MOTO | Block 2334 confirmed |
| 2 | Expansion rebase | +3.19M BAMPL (63.81M -> 67.00M), Epoch 5->6 |
| 3 | Post price 0.25 MOTO | Block 2336 confirmed |
| 4 | Contraction rebase | -5.16M BAMPL (67.00M -> 61.85M), Epoch 6->7 |
| 5 | Post price 5.00 MOTO | Block 2338 confirmed |
| 6 | Rebase attempt | FAILED: "Could not decode transaction" |

The demo proved elastic supply works perfectly — both expansion and contraction executed correctly. The failure at step 6 was the intermittent SDK serialization bug, not a contract issue.
