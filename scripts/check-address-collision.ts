import { JSONRpcProvider, getContract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: NETWORK });
const contract = getContract('opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4', BAMPLTokenAbi, p, NETWORK);

// These are the 3 addresses that received faucet claims
const addrs = [
    'opt1p4rrs3982g3lm0pm3t8tt97x39fknnxct33chmy7arg8ccsx9q37qkqg90x',  // curl test
    'opt1pgcgetmuz05ndmhgk3nxcjt8k0g23gwq67vxdx3tqchm5vy7mczsqxn44ys',  // someone else  
    'opt1pcluu8yypmu3ylynk8vdxv44snyjmyff2f9j9vehggcfrunnmqkfq4phqrv',  // user
];

async function main() {
    for (const bech32 of addrs) {
        const raw = await p.getPublicKeysInfoRaw(bech32);
        const info = raw[bech32] as any;
        if (!info?.tweakedPubkey) {
            console.log(`${bech32.slice(0, 16)}... NO KEY INFO`);
            continue;
        }

        const fakeMldsa = '0x' + '00'.repeat(1312);
        const tweaked = '0x' + info.tweakedPubkey;
        const addrObj = Address.fromString(fakeMldsa, tweaked);

        // Check the internal address representation
        console.log(`\n${bech32.slice(0, 20)}...`);
        console.log('  tweakedPubkey:', info.tweakedPubkey.slice(0, 16) + '...');
        console.log('  Address keys:', Object.keys(addrObj));
        console.log('  Address toString:', addrObj.toString?.()?.slice(0, 40));
        
        // Convert to see what the contract would use as storage key
        const buf = Buffer.from(addrObj as any);
        console.log('  Address bytes (first 8):', buf.slice(0, 8).toString('hex'));
        console.log('  Address bytes (all):', buf.toString('hex').slice(0, 64) + '...');

        const bal = await (contract as any).balanceOf(addrObj);
        console.log('  balanceOf:', (bal?.properties?.balance ?? 0n).toString());
    }
}
main().catch(e => console.error(e.message?.slice(0, 300)));
