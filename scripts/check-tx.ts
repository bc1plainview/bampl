import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

async function main() {
    // The user's faucet claim TX
    const tx = await p.getTransaction('f604894842e7ef8d4429ef6b957ded3a1b3e7aaa5f82f883e0cd319ac5aa2469');
    console.log('TX:', JSON.stringify(tx, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    const receipt = await p.getTransactionReceipt('f604894842e7ef8d4429ef6b957ded3a1b3e7aaa5f82f883e0cd319ac5aa2469');
    console.log('\nReceipt:', JSON.stringify(receipt, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}
main().catch(e => console.error(e.message?.slice(0, 500)));
