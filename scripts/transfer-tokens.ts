import 'dotenv/config';
import { Address, Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { fromBech32, networks, toHex } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const limitedProvider = new OPNetLimitedProvider(RPC_URL);

const TO_BECH32 = process.argv[2] || '';
const AMOUNT_BAMPL = BigInt(process.argv[3] || '10000000'); // default 10M BAMPL

async function main() {
    if (!TO_BECH32) {
        console.error('Usage: npx tsx transfer-tokens.ts <to-address> [amount-bampl]');
        process.exit(1);
    }

    // Resolve ML-DSA public key hash from chain
    console.log('Resolving address public keys...');
    const mldsaResult = await provider.getPublicKeyInfo(TO_BECH32);
    if (!mldsaResult) {
        console.error('Could not resolve public key info for', TO_BECH32);
        console.error('The recipient must have an ML-DSA key linked on-chain.');
        return;
    }

    // Decode tweaked public key from bech32m address
    const decoded = fromBech32(TO_BECH32);
    const tweakedPubKeyHex = '0x' + toHex(decoded.data);

    // Convert ML-DSA hash to hex string if it's a Uint8Array
    const mldsaHex = typeof mldsaResult === 'string'
        ? mldsaResult
        : '0x' + toHex(mldsaResult instanceof Uint8Array ? mldsaResult : new Uint8Array(mldsaResult as ArrayBuffer));

    console.log('ML-DSA hash:', mldsaHex);
    console.log('Tweaked pubkey:', tweakedPubKeyHex);

    // Create Address from public keys
    const toAddress = Address.fromString(mldsaHex, tweakedPubKeyHex);

    const amount = AMOUNT_BAMPL * 100_000_000n; // convert to 8 decimals
    console.log(`Transferring ${AMOUNT_BAMPL.toLocaleString()} BAMPL to ${TO_BECH32}`);

    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    const sim = await (c as ReturnType<typeof getContract>).transfer(toAddress, amount);
    if (!sim?.calldata) {
        console.log('Simulation failed');
        return;
    }
    console.log('Simulation OK');

    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    const challenge = await provider.getChallenge();

    const result = await sim.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        from: wallet.address,
        refundTo: wallet.p2tr,
        utxos,
        challenge,
        feeRate: 50,
        priorityFee: 50_000n,
        maximumAllowedSatToSpend: 500_000n,
        network: NETWORK,
    });

    console.log('TX:', result?.transactionId, 'peers:', result?.peerAcknowledgements);
}

main().catch(err => console.error('Error:', (err as Error).message?.slice(0, 300)));
