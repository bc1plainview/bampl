/**
 * BAMPL Faucet Server
 *
 * Distributes 1,000 BAMPL to any connected wallet address.
 * Rate-limited to 1 claim per address per hour.
 *
 * Usage: npx tsx faucet-server.ts
 * Endpoint: POST /api/faucet  { "address": "opt1p..." }
 */
import 'dotenv/config';
import http from 'node:http';
import { Address, Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;
const PORT = parseInt(process.env.FAUCET_PORT || '3001', 10);

const FAUCET_AMOUNT = 100_000_000_000n; // 1,000 BAMPL (8 decimals)

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);

// Mutex to prevent concurrent sends (UTXO conflicts)
let sending = false;

function createFreshInstances() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const contract = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    contract.setSender(wallet.address);
    return { provider, limitedProvider, contract };
}

interface FaucetRequest {
    address: string;
    hashedMLDSAKey?: string;
    publicKey?: string;
}

async function handleFaucet(req: FaucetRequest): Promise<{ txHash: string }> {
    const { address, hashedMLDSAKey } = req;

    if (sending) {
        throw new Error('Another transaction is in progress. Please try again in a moment.');
    }

    sending = true;
    try {
        // Fresh instances to avoid stale SDK state
        const { provider, limitedProvider, contract } = createFreshInstances();

        // Resolve recipient address
        let toAddr: Address;

        if (hashedMLDSAKey) {
            // Best path: wallet provided its MLDSA hash — construct Address directly
            toAddr = new Address(Buffer.from(hashedMLDSAKey, 'hex'));
            console.log(`  Using wallet-provided MLDSA hash: ${hashedMLDSAKey.slice(0, 16)}...`);
        } else {
            // Fallback: try on-chain lookup (only works if ML-DSA is linked)
            try {
                const resolved = await provider.getPublicKeyInfo(address, false);
                if (!resolved) throw new Error('null');
                toAddr = resolved;
            } catch {
                // Last resort: check if on-chain raw info has the hash
                const raw = await provider.getPublicKeysInfoRaw(address);
                const info = raw[address];
                if (info && !('error' in info) && info.mldsaHashedPublicKey) {
                    toAddr = new Address(Buffer.from(info.mldsaHashedPublicKey, 'hex'));
                } else {
                    throw new Error('Could not resolve your address. Please connect with OP_WALLET which provides your ML-DSA identity.');
                }
            }
        }

        // Simulate transfer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sim = await (contract as any).transfer(toAddr, FAUCET_AMOUNT);
        if (!sim?.calldata) {
            throw new Error('Transfer simulation failed. The contract may be temporarily unavailable.');
        }

        // Fetch UTXOs
        const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
        if (utxos.length === 0) {
            throw new Error('Faucet is temporarily out of gas. Please try again later.');
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
            throw new Error('Transaction failed to broadcast. Please try again.');
        }

        console.log(`  Sent 1,000 BAMPL to ${address.slice(0, 12)}... TX: ${result.transactionId}`);

        return { txHash: result.transactionId };
    } finally {
        sending = false;
    }
}

function parseBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        sendJSON(res, 204, null);
        return;
    }

    // Faucet endpoint
    if (req.method === 'POST' && req.url === '/api/faucet') {
        try {
            const body = await parseBody(req);
            const parsed = JSON.parse(body) as FaucetRequest;

            if (!parsed.address || typeof parsed.address !== 'string' || parsed.address.length < 10) {
                sendJSON(res, 400, { success: false, error: 'Invalid address.' });
                return;
            }

            console.log(`\n  Faucet request: ${parsed.address.slice(0, 16)}...`);
            const result = await handleFaucet(parsed);
            sendJSON(res, 200, { success: true, txHash: result.txHash, amount: '1000' });
        } catch (err: unknown) {
            const msg = (err as Error).message || 'Unknown error';
            console.error(`  Faucet error: ${msg.slice(0, 200)}`);
            sendJSON(res, 500, { success: false, error: msg });
        }
        return;
    }

    // Health check
    if (req.method === 'GET' && (req.url === '/api/health' || req.url === '/')) {
        sendJSON(res, 200, {
            status: 'ok',
            faucet: 'BAMPL Token Faucet',
            amount: '1,000 BAMPL per claim',
        });
        return;
    }

    sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
    console.log(`\n  BAMPL Faucet Server`);
    console.log(`  -------------------`);
    console.log(`  URL:      http://localhost:${PORT}`);
    console.log(`  Deployer: ${wallet.p2tr}`);
    console.log(`  Contract: ${CONTRACT}`);
    console.log(`  Amount:   1,000 BAMPL per claim\n`);
});
