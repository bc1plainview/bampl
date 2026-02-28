import { JSONRpcProvider, getContract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: NETWORK });
const contract = getContract('opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4', BAMPLTokenAbi, p, NETWORK);

async function main() {
    // The deployer has ML-DSA linked. Get their real Address via getPublicKeyInfo.
    const deployerBech32 = 'opt1pfmn8j0lfufc8askgjfkl8jp5z045pnjd94tx2s9x6rq3nrxl6syqadhlf4';
    const realAddr = await p.getPublicKeyInfo(deployerBech32, false);
    
    console.log('Real Address bytes:', Buffer.from(realAddr as any).toString('hex'));

    // Now construct from just the hashedMLDSAKey 
    const raw = await p.getPublicKeysInfoRaw(deployerBech32);
    const info = raw[deployerBech32] as any;
    console.log('hashedMLDSAKey:', info.mldsaHashedPublicKey);
    
    // Construct Address from hash bytes
    const hashBytes = Buffer.from(info.mldsaHashedPublicKey, 'hex');
    const constructedAddr = new Address(hashBytes);
    console.log('Constructed bytes:', Buffer.from(constructedAddr as any).toString('hex'));
    console.log('Bytes match:', Buffer.from(realAddr as any).toString('hex') === Buffer.from(constructedAddr as any).toString('hex'));

    // Test balanceOf with both
    const bal1 = await (contract as any).balanceOf(realAddr);
    const bal2 = await (contract as any).balanceOf(constructedAddr);
    console.log('Real addr balance:', bal1?.properties?.balance?.toString());
    console.log('Constructed balance:', bal2?.properties?.balance?.toString());
    console.log('Balances match:', bal1?.properties?.balance === bal2?.properties?.balance);

    // Now test transfer simulation with constructed address
    const sim = await (contract as any).transfer(constructedAddr, 100_000_000_000n);
    console.log('Transfer sim succeeded:', !!sim?.calldata);
}
main().catch(e => console.error(e.message?.slice(0, 300)));
