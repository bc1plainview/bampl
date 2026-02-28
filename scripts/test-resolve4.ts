import 'dotenv/config';
import { JSONRpcProvider, getContract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address, Mnemonic, OPNetLimitedProvider } from '@btc-vision/transaction';
import { BAMPLTokenAbi } from './bampl-abi.js';

const NETWORK = networks.opnetTestnet;
const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: NETWORK });
const contract = getContract('opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4', BAMPLTokenAbi, p, NETWORK);

const mnemonic = new Mnemonic(process.env.DEPLOYER_MNEMONIC!, '', NETWORK);
const wallet = mnemonic.derive(0);
contract.setSender(wallet.address);

const userAddr = 'opt1p4rrs3982g3lm0pm3t8tt97x39fknnxct33chmy7arg8ccsx9q37qkqg90x';

async function main() {
    // Get raw data
    const raw = await p.getPublicKeysInfoRaw(userAddr);
    const info = raw[userAddr];
    console.log('Raw info:', info);

    // Approach 1: Use Address.fromString with fake zero ML-DSA of level 44 (1312 bytes)
    try {
        const fakeMldsa = '0x' + '00'.repeat(1312);
        const tweaked = '0x' + info.tweakedPubkey;
        const addr = Address.fromString(fakeMldsa, tweaked);
        console.log('Approach 1 (fake MLDSA-44): Address created');

        // Try balanceOf
        const bal = await (contract as any).balanceOf(addr);
        console.log('  balanceOf:', bal?.properties?.balance?.toString());
    } catch (e) {
        console.log('Approach 1 error:', (e as Error).message?.slice(0, 200));
    }

    // Approach 2: Try to simulate a transfer to this fake address
    try {
        const fakeMldsa = '0x' + '00'.repeat(1312);
        const tweaked = '0x' + info.tweakedPubkey;
        const addr = Address.fromString(fakeMldsa, tweaked);
        console.log('\nApproach 2: Simulating transfer to fake MLDSA address');

        const amount = 100_000_000_000n; // 1,000 BAMPL
        const sim = await (contract as any).transfer(addr, amount);
        console.log('  Simulation result:', !!sim?.calldata);
        if (sim?.calldata) {
            console.log('  Transfer simulation SUCCEEDED - can send to this address!');
        }
    } catch (e) {
        console.log('Approach 2 error:', (e as Error).message?.slice(0, 200));
    }

    // Approach 3: Try using the tweaked pubkey bytes directly as an Address-like object
    try {
        const tweakedBytes = Buffer.from(info.tweakedPubkey, 'hex');
        console.log('\nApproach 3: Raw tweaked pubkey as address-like');
        console.log('  Bytes length:', tweakedBytes.length);

        // The Address from getPublicKeyInfo had keys 0-31. Maybe it IS just the tweaked pubkey bytes?
        const bal = await (contract as any).balanceOf(tweakedBytes);
        console.log('  balanceOf result:', bal?.properties?.balance?.toString());
    } catch (e) {
        console.log('Approach 3 error:', (e as Error).message?.slice(0, 200));
    }
}

main().catch(e => console.error('Fatal:', (e as Error).message?.slice(0, 300)));
