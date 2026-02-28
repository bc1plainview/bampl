import 'dotenv/config';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const DEPLOY_TX = '4fcfc2140afb7006e8fa58dc9e4b9ce3c9d222a9ec7e7620e12237b4a22f5cf4';

async function main() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    const txInfo = await provider.getTransaction(DEPLOY_TX);

    // Decode rawRevert
    if (txInfo && (txInfo as any).rawRevert) {
        const revertObj = (txInfo as any).rawRevert;
        const bytes: number[] = [];
        for (const key of Object.keys(revertObj).sort((a, b) => Number(a) - Number(b))) {
            bytes.push(revertObj[key]);
        }
        const buf = Buffer.from(bytes);
        console.log('Raw revert hex:', buf.toString('hex'));
        // Skip first 8 bytes (selector + length prefix), read as utf8
        console.log('Revert message (full):', buf.toString('utf8'));
        console.log('Revert message (skip selector):', buf.slice(4).toString('utf8'));
        console.log('Revert message (skip 8):', buf.slice(8).toString('utf8'));
    }

    // Also check if failed
    console.log('\nFailed:', (txInfo as any)?.failed);
    console.log('Gas used:', (txInfo as any)?.gasUsed?.toString());

    // Check revert as string
    if ((txInfo as any)?.revert) {
        console.log('Revert string:', (txInfo as any).revert);
    }
}

main().catch((err) => console.error(err));
