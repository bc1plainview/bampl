import 'dotenv/config';
import { Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { getContract, JSONRpcProvider } from 'opnet';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: NETWORK });
const limitedProvider = new OPNetLimitedProvider('https://testnet.opnet.org');
const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
const CONTRACT = process.env.BAMPL_CONTRACT_ADDRESS!;

console.log('Contract:', CONTRACT);
console.log('Wallet:', wallet.p2tr);

// Check UTXOs
const utxos = await limitedProvider.fetchUTXO({ address: wallet.p2tr, minAmount: 10_000n });
const total = utxos.reduce((s: bigint, u: { value: bigint }) => s + u.value, 0n);
console.log(`\nUTXOs: ${utxos.length}, total: ${total} sats`);

// Read contract state
const c = getContract(CONTRACT, BAMPLTokenAbi, provider, NETWORK);
c.setSender(wallet.address);

const [ts, p, t, ep, cr] = await Promise.all([
    (c as ReturnType<typeof getContract>).totalSupply(),
    (c as ReturnType<typeof getContract>).currentPrice(),
    (c as ReturnType<typeof getContract>).targetPrice(),
    (c as ReturnType<typeof getContract>).currentEpoch(),
    (c as ReturnType<typeof getContract>).canRebase(),
]);

const props = (r: { properties: Record<string, unknown> }) => r.properties;
console.log('\nContract State:');
console.log('  Supply:', props(ts).totalSupply);
console.log('  Price:', props(p).price);
console.log('  Target:', props(t).target);
console.log('  Epoch:', props(ep).epoch);
console.log('  Can Rebase:', props(cr).ready);
