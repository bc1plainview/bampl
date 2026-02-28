/**
 * Trigger a single rebase transaction.
 * Watch http://localhost:5174/ to see the supply change live.
 */
import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const limitedProvider = new OPNetLimitedProvider(RPC_URL);

function fmt(val: bigint, dec = 8): string {
    const s = val.toString().padStart(dec + 1, '0');
    return s.slice(0, -dec) + '.' + s.slice(-dec);
}

const mode = process.argv[2] || 'rebase'; // rebase | price-up | price-down

async function main() {
    const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
    c.setSender(wallet.address);

    // Read current state
    const [tsRes, pRes, tRes, epRes, crRes] = await Promise.all([
        (c as ReturnType<typeof getContract>).totalSupply(),
        (c as ReturnType<typeof getContract>).currentPrice(),
        (c as ReturnType<typeof getContract>).targetPrice(),
        (c as ReturnType<typeof getContract>).currentEpoch(),
        (c as ReturnType<typeof getContract>).canRebase(),
    ]);

    const supply = BigInt(tsRes.properties.totalSupply as string);
    const price = BigInt(pRes.properties.price as string);
    const target = BigInt(tRes.properties.target as string);
    const epoch = BigInt(epRes.properties.epoch as string);
    const canRebase = crRes.properties.ready as boolean;

    console.log(`Supply: ${fmt(supply)} | Price: ${fmt(price)} | Target: ${fmt(target)} | Epoch: ${epoch} | Can Rebase: ${canRebase}`);

    let sim: Awaited<ReturnType<ReturnType<typeof getContract>['rebase']>>;

    if (mode === 'price-up') {
        console.log('\nPosting price: 1.30 MOTO (30% above target)...');
        sim = await (c as ReturnType<typeof getContract>).postPrice(130_000_000n);
    } else if (mode === 'price-down') {
        console.log('\nPosting price: 0.75 MOTO (25% below target)...');
        sim = await (c as ReturnType<typeof getContract>).postPrice(75_000_000n);
    } else {
        if (!canRebase) {
            console.log('\nCannot rebase yet - epoch not elapsed');
            return;
        }
        console.log('\nTriggering rebase...');
        sim = await (c as ReturnType<typeof getContract>).rebase();
    }

    if (!sim?.calldata) {
        console.log('Simulation failed:', sim);
        return;
    }
    console.log('Simulation OK');

    const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
    const challenge = await provider.getChallenge();

    const txResult = await sim.sendTransaction({
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

    if (txResult?.transactionId) {
        console.log(`TX: ${txResult.transactionId} (${txResult.peerAcknowledgements} peers)`);
        console.log('\nWatch http://localhost:5174/ - supply will update after block confirmation (~10 min)');
    }
}

main().catch(err => { console.error('Error:', (err as Error).message?.slice(0, 300)); process.exit(1); });
