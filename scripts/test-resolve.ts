import { JSONRpcProvider } from 'opnet';
import { networks, fromBech32, toHex } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const p = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });
const addr = 'opt1p4rrs3982g3lm0pm3t8tt97x39fknnxct33chmy7arg8ccsx9q37qkqg90x';

async function main() {
    // Method 1: getPublicKeysInfoRaw
    try {
        const raw = await p.getPublicKeysInfoRaw(addr);
        console.log('getPublicKeysInfoRaw type:', typeof raw);
        console.log('getPublicKeysInfoRaw:', JSON.stringify(raw, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e) {
        console.log('getPublicKeysInfoRaw error:', (e as Error).message?.slice(0, 300));
    }

    // Method 2: getPublicKeysInfo (plural, no second arg)
    try {
        const info = await p.getPublicKeysInfo(addr);
        console.log('getPublicKeysInfo type:', typeof info);
        console.log('getPublicKeysInfo:', JSON.stringify(info, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e) {
        console.log('getPublicKeysInfo error:', (e as Error).message?.slice(0, 300));
    }

    // Method 3: validateAddress
    try {
        const valid = await p.validateAddress(addr);
        console.log('validateAddress:', JSON.stringify(valid, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e) {
        console.log('validateAddress error:', (e as Error).message?.slice(0, 300));
    }

    // Method 4: Manual bech32 decode
    try {
        const decoded = fromBech32(addr);
        const tweakedHex = '0x' + toHex(decoded.data);
        console.log('bech32 decode tweakedPubKey:', tweakedHex);
        console.log('bech32 version:', decoded.version);
        console.log('bech32 data length:', decoded.data.length);
    } catch (e) {
        console.log('bech32 decode error:', (e as Error).message?.slice(0, 200));
    }
}

main().catch(e => console.error('Fatal:', (e as Error).message));
