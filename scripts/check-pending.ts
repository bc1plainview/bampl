import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

async function main() {
    const block = await p.getBlockNumber();
    console.log('Current block:', block.toString());
    
    // Check pending TX
    try {
        const pending = await p.getPendingTransaction('a1a98de93e713ae5636f337c6c4bc9eb23112b222fa5f8c89921e7cb0849cd4a');
        console.log('Pending TX found:', !!pending);
        if (pending) console.log('Pending details:', JSON.stringify(pending, (_, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 500));
    } catch (e) {
        console.log('Pending lookup:', (e as Error).message?.slice(0, 200));
    }
}
main().catch(e => console.error(e.message?.slice(0, 200)));
