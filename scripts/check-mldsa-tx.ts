import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';

// ML-DSA linking TX from earlier
const MLDSA_TX = '5c3f4f740b38b611722d44063b1e77c176b89b993785316a33a412b4848be50f';
// Deploy TX
const DEPLOY_TX = '1b35788ebdca7bf05d02e5df36cbf6aec3fa39f55619c70c60aaa2a12dcb89d1';

function decodeRevertBytes(obj: Record<string, number>): string {
    const values = Object.values(obj);
    // Skip first 4 bytes (selector) and next 4 bytes (length prefix)
    const startIdx = values.findIndex((_, i) => i >= 4 && values.slice(i, i + 6).every(v => v >= 32 && v <= 126));
    const chars = values.slice(startIdx).filter(v => v >= 32 && v <= 126);
    return String.fromCharCode(...chars);
}

async function main() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Check ML-DSA linking TX
    console.log('=== ML-DSA Linking TX ===');
    console.log('Hash:', MLDSA_TX);
    try {
        const tx = await provider.getTransaction(MLDSA_TX);
        if (tx) {
            const json = JSON.stringify(tx, (_, v) => typeof v === 'bigint' ? v.toString() : v);
            console.log('Status:', (tx as any).failed === true ? 'FAILED' : (tx as any).rawRevert ? 'REVERTED' : 'OK');
            if ((tx as any).rawRevert) {
                console.log('Revert:', decodeRevertBytes((tx as any).rawRevert));
            }
            console.log('Gas used:', (tx as any).gasUsed?.toString());
        } else {
            console.log('TX not found - might not be confirmed yet');
        }
    } catch (e: any) {
        console.log('Error:', e.message?.slice(0, 300));
    }

    // Check ML-DSA linking TX receipt
    console.log('\n=== ML-DSA Linking Receipt ===');
    try {
        const receipt = await provider.getTransactionReceipt(MLDSA_TX);
        console.log('Receipt:', JSON.stringify(receipt, (_, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 500));
    } catch (e: any) {
        console.log('Error:', e.message?.slice(0, 300));
    }

    // Check deploy TX revert
    console.log('\n=== Deploy TX Revert ===');
    try {
        const tx = await provider.getTransaction(DEPLOY_TX);
        if (tx && (tx as any).rawRevert) {
            console.log('Revert:', decodeRevertBytes((tx as any).rawRevert));
        }
    } catch (e: any) {
        console.log('Error:', e.message?.slice(0, 300));
    }
}

main().catch(e => console.error('FATAL:', e));
