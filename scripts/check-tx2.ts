import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

async function main() {
    const txid = 'a1a98de93e713ae5636f337c6c4bc9eb23112b222fa5f8c89921e7cb0849cd4a';
    
    const tx = await p.getTransaction(txid);
    console.log('TX found:', !!tx);
    console.log('Failed:', tx?.failed);
    console.log('Block:', tx?.blockNumber?.toString());
    console.log('Gas used:', tx?.gasUsed?.toString());
    console.log('Type:', tx?.OPNetType);
    console.log('Contract:', tx?.contractAddress);
    
    const receipt = await p.getTransactionReceipt(txid);
    console.log('\nReceipt found:', !!receipt);
    console.log('Receipt failed:', receipt?.failed);
    console.log('Receipt gas:', receipt?.gasUsed?.toString());
    
    if (receipt?.events) {
        console.log('Events:', JSON.stringify(receipt.events, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    }
}
main().catch(e => console.error('Error:', e.message?.slice(0, 300)));
