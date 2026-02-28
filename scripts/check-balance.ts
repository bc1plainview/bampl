import { JSONRpcProvider, getContract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: NETWORK });
const contract = getContract('opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4', BAMPLTokenAbi, p, NETWORK);

const addr = 'opt1pcluu8yypmu3ylynk8vdxv44snyjmyff2f9j9vehggcfrunnmqkfq4phqrv';

async function main() {
    const raw = await p.getPublicKeysInfoRaw(addr);
    const info = raw[addr];
    console.log('Raw info:', JSON.stringify(info));

    const fakeMldsa = '0x' + '00'.repeat(1312);
    const tweaked = '0x' + (info as any).tweakedPubkey;
    const addrObj = Address.fromString(fakeMldsa, tweaked);

    const bal = await (contract as any).balanceOf(addrObj);
    const rawBal = bal?.properties?.balance;
    console.log('balanceOf raw bigint:', rawBal?.toString());
    console.log('Divided by 1e8:', Number(rawBal ?? 0n) / 1e8);

    const scaledBal = await (contract as any).scaledBalanceOf(addrObj);
    const rawScaled = scaledBal?.properties?.scaledBalance;
    console.log('scaledBalanceOf raw:', rawScaled?.toString());

    const ts = await (contract as any).totalSupply();
    console.log('totalSupply raw:', ts?.properties?.totalSupply?.toString());
    console.log('totalSupply / 1e8:', Number(ts?.properties?.totalSupply ?? 0n) / 1e8);

    const dec = await (contract as any).decimals();
    console.log('decimals:', dec?.properties?.decimals?.toString());
}
main().catch(e => console.error(e.message));
