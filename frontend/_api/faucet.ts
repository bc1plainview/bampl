/**
 * BAMPL Faucet — Vercel Serverless Function
 *
 * POST /api/faucet  { "address": "opt1p...", "hashedMLDSAKey?": "hex..." }
 * Returns: { "success": true, "txHash": "...", "amount": "1000" }
 *
 * Environment variables (set in Vercel dashboard):
 *   DEPLOYER_MNEMONIC       — 24-word mnemonic for the faucet wallet
 *   BAMPL_CONTRACT_ADDRESS  — the deployed BAMPL contract address
 *   RPC_URL                 — OPNet JSON-RPC endpoint (defaults to testnet)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Address, Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, getContract, JSONRpcProvider, OP_NET_ABI } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;
const FAUCET_AMOUNT = 100_000_000_000n; // 1,000 BAMPL (8 decimals)

const BAMPLTokenAbi: BitcoinInterfaceAbi = [
    {
        name: 'transfer',
        constant: false,
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    ...OP_NET_ABI,
];

interface FaucetBody {
    address: string;
    hashedMLDSAKey?: string;
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Set CORS headers for all responses
    for (const [k, v] of Object.entries(corsHeaders())) {
        res.setHeader(k, v);
    }

    try {
        const body = req.body as FaucetBody;

        if (!body.address || typeof body.address !== 'string' || body.address.length < 10) {
            return res.status(400).json({ success: false, error: 'Invalid address.' });
        }

        if (!process.env.DEPLOYER_MNEMONIC) {
            return res.status(500).json({ success: false, error: 'Faucet not configured.' });
        }

        // Derive wallet from mnemonic
        const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC, '', NETWORK);
        const wallet = mnemonic.derive(0);

        // Fresh provider + contract instances
        const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
        const limitedProvider = new OPNetLimitedProvider(RPC_URL);
        const contract = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
        contract.setSender(wallet.address);

        // Resolve recipient address
        let toAddr: Address;

        if (body.hashedMLDSAKey) {
            toAddr = new Address(Buffer.from(body.hashedMLDSAKey, 'hex'));
        } else {
            try {
                const resolved = await provider.getPublicKeyInfo(body.address, false);
                if (!resolved) throw new Error('null');
                toAddr = resolved;
            } catch {
                const raw = await provider.getPublicKeysInfoRaw(body.address);
                const info = raw[body.address];
                if (info && !('error' in info) && info.mldsaHashedPublicKey) {
                    toAddr = new Address(Buffer.from(info.mldsaHashedPublicKey, 'hex'));
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Could not resolve your address. Please connect with OP_WALLET which provides your ML-DSA identity.',
                    });
                }
            }
        }

        // Simulate transfer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sim = await (contract as any).transfer(toAddr, FAUCET_AMOUNT);
        if (!sim?.calldata) {
            return res.status(500).json({
                success: false,
                error: 'Transfer simulation failed. The contract may be temporarily unavailable.',
            });
        }

        // Fetch UTXOs
        const utxos = await limitedProvider.fetchUTXO({
            address: wallet.p2tr,
            minAmount: 10_000n,
        } as Parameters<typeof limitedProvider.fetchUTXO>[0]);
        if (utxos.length === 0) {
            return res.status(503).json({
                success: false,
                error: 'Faucet is temporarily out of gas. Please try again later.',
            });
        }

        const challenge = await provider.getChallenge();

        // Send transaction
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

        if (!result?.transactionId) {
            return res.status(500).json({
                success: false,
                error: 'Transaction failed to broadcast. Please try again.',
            });
        }

        console.log(`Faucet: sent 1,000 BAMPL to ${body.address.slice(0, 12)}... TX: ${result.transactionId}`);

        return res.status(200).json({
            success: true,
            txHash: result.transactionId,
            amount: '1000',
        });
    } catch (err: unknown) {
        const msg = (err as Error).message || 'Unknown error';
        console.error(`Faucet error: ${msg.slice(0, 300)}`);
        return res.status(500).json({ success: false, error: msg });
    }
}
