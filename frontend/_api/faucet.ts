/**
 * BAMPL Faucet — Vercel Serverless Function (Build Output API v3)
 *
 * POST /api/faucet  { "address": "opt1p...", "hashedMLDSAKey?": "hex..." }
 * Returns: { "success": true, "txHash": "...", "amount": "1000" }
 *
 * Uses raw Node.js http.IncomingMessage / http.ServerResponse
 * (Build Output API v3 does NOT provide VercelRequest/VercelResponse).
 *
 * Environment variables (set in Vercel dashboard):
 *   DEPLOYER_MNEMONIC       — 24-word mnemonic for the faucet wallet
 *   BAMPL_CONTRACT_ADDRESS  — the deployed BAMPL contract address
 *   RPC_URL                 — OPNet JSON-RPC endpoint (defaults to testnet)
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Address, Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi, getContract, JSONRpcProvider, OP_NET_ABI } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = (process.env.RPC_URL || 'https://testnet.opnet.org').trim();
const CONTRACT = (process.env.BAMPL_CONTRACT_ADDRESS || '').trim();
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

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, CORS_HEADERS);
    res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        sendJSON(res, 405, { success: false, error: 'Method not allowed' });
        return;
    }

    try {
        const rawBody = await readBody(req);
        let body: FaucetBody;
        try {
            body = JSON.parse(rawBody) as FaucetBody;
        } catch {
            sendJSON(res, 400, { success: false, error: 'Invalid JSON body.' });
            return;
        }

        if (!body.address || typeof body.address !== 'string' || body.address.length < 10) {
            sendJSON(res, 400, { success: false, error: 'Invalid address.' });
            return;
        }

        if (!process.env.DEPLOYER_MNEMONIC) {
            sendJSON(res, 500, { success: false, error: 'Faucet not configured.' });
            return;
        }

        // Derive wallet from mnemonic (trim whitespace/newlines from env var)
        const mnemonicPhrase = process.env.DEPLOYER_MNEMONIC.trim();
        const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK);
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
                    sendJSON(res, 400, {
                        success: false,
                        error: 'Could not resolve your address. Please connect with OP_WALLET which provides your ML-DSA identity.',
                    });
                    return;
                }
            }
        }

        // Simulate transfer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sim = await (contract as any).transfer(toAddr, FAUCET_AMOUNT);
        if (!sim?.calldata) {
            sendJSON(res, 500, {
                success: false,
                error: 'Transfer simulation failed. The contract may be temporarily unavailable.',
            });
            return;
        }

        // Fetch UTXOs
        const utxos = await limitedProvider.fetchUTXO({
            address: wallet.p2tr,
            minAmount: 10_000n,
        } as Parameters<typeof limitedProvider.fetchUTXO>[0]);
        if (utxos.length === 0) {
            sendJSON(res, 503, {
                success: false,
                error: 'Faucet is temporarily out of gas. Please try again later.',
            });
            return;
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
            sendJSON(res, 500, {
                success: false,
                error: 'Transaction failed to broadcast. Please try again.',
            });
            return;
        }

        console.log(`Faucet: sent 1,000 BAMPL to ${body.address.slice(0, 12)}... TX: ${result.transactionId}`);

        sendJSON(res, 200, {
            success: true,
            txHash: result.transactionId,
            amount: '1000',
        });
    } catch (err: unknown) {
        const msg = (err as Error).message || 'Unknown error';
        console.error(`Faucet error: ${msg.slice(0, 300)}`);
        sendJSON(res, 500, { success: false, error: msg });
    }
}
