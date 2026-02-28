/**
 * Test basic contract interaction against a known-working OP20 contract.
 * If this also fails, the issue is SDK/RPC, not our contract.
 */
import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';
const KNOWN_CONTRACT = 'opt1sqqlnq2fg3lfcpdfrz25mmwkvvnvm2yca0vnw7use';

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const limitedProvider = new OPNetLimitedProvider(RPC_URL);

async function main() {
    console.log('Testing basic TX against known contract:', KNOWN_CONTRACT);
    console.log('Wallet:', wallet.p2tr);

    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    console.log(`UTXOs: ${utxos.length}, total: ${utxos.reduce((s: bigint, u: { value: bigint }) => s + u.value, 0n)}`);

    if (!utxos.length) {
        console.log('No UTXOs available');
        return;
    }

    const c = getContract(KNOWN_CONTRACT, OP_20_ABI, provider, NETWORK);
    c.setSender(wallet.address);

    console.log('\nSimulating increaseAllowance(self, 0)...');
    const sim = await (c as ReturnType<typeof getContract>).increaseAllowance(wallet.address, 0n);

    if (!sim?.calldata) {
        console.log('Simulation failed');
        return;
    }
    console.log('Simulation OK');

    const challenge = await provider.getChallenge();

    console.log('\nSending transaction...');
    try {
        const result = await sim.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            from: wallet.address,
            refundTo: wallet.p2tr,
            utxos,
            challenge,
            feeRate: 100,
            priorityFee: 100_000n,
            maximumAllowedSatToSpend: 500_000n,
            network: NETWORK,
        });
        console.log('TX:', result?.transactionId, 'peers:', result?.peerAcknowledgements);
    } catch (e: unknown) {
        console.error('Error:', (e as Error).message?.slice(0, 300));
    }
}

main().catch(err => console.error('Fatal:', (err as Error).message?.slice(0, 500)));
