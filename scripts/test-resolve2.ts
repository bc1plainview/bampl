import { JSONRpcProvider } from 'opnet';
import { networks, fromBech32, toHex } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });
const addr = 'opt1p4rrs3982g3lm0pm3t8tt97x39fknnxct33chmy7arg8ccsx9q37qkqg90x';

async function main() {
    // Get raw key info
    const raw = await p.getPublicKeysInfoRaw(addr);
    const info = raw[addr];
    console.log('Raw info:', info);

    // Try constructing Address from just the tweaked pubkey (with empty/zero ML-DSA hash)
    const tweaked = '0x' + info.tweakedPubkey;
    console.log('tweakedPubkey hex:', tweaked);

    // Try with p2op as the ML-DSA hash (it's the hashed version)
    const p2op = info.p2op;
    console.log('p2op:', p2op);

    // Decode p2op to get the hash
    const p2opDecoded = fromBech32(p2op);
    const p2opHex = '0x' + toHex(p2opDecoded.data);
    console.log('p2op decoded hex:', p2opHex);

    // Try Address.fromString with p2op hash + tweaked pubkey
    try {
        const address = Address.fromString(p2opHex, tweaked);
        console.log('Address.fromString succeeded!');
        console.log('Address:', address);
        console.log('Address type:', typeof address);

        // Try using it in a contract call
        const { getContract } = await import('opnet');
        const { BAMPLTokenAbi } = await import('./bampl-abi.js');
        const contract = getContract(
            'opt1sqr9wjgmef2qceynj4wpzeg0vkqvxhyxpeq8z5nr4',
            BAMPLTokenAbi,
            p,
            networks.opnetTestnet,
        );

        const balance = await (contract as any).balanceOf(address);
        console.log('balanceOf result:', balance?.properties);
    } catch (e) {
        console.log('Address.fromString error:', (e as Error).message?.slice(0, 300));
    }
}

main().catch(e => console.error('Fatal:', (e as Error).message?.slice(0, 300)));
