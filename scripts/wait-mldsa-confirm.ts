/**
 * Wait for ML-DSA linking TX confirmation, then check if key was linked.
 */
import 'dotenv/config';

const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const TX_HASH = '0be3909ff88b041b55e7d67597274ea39c3ad4b01ec52be37ae27e1f344c25be';
const ADDRESS = 'opt1pfmn8j0lfufc8askgjfkl8jp5z045pnjd94tx2s9x6rq3nrxl6syqadhlf4';
const MAX_WAIT = 30 * 60 * 1000; // 30 minutes

async function rpc(method: string, params: any[] = []) {
    const resp = await fetch(`${RPC_URL}/api/v1/json-rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const data = await resp.json();
    return data;
}

async function main() {
    const start = Date.now();
    console.log(`Waiting for TX ${TX_HASH.slice(0, 16)}... to confirm`);
    console.log(`Target: block 2310+`);

    let confirmed = false;
    while (Date.now() - start < MAX_WAIT) {
        const blockData = await rpc('btc_blockNumber');
        const blockNum = parseInt(blockData.result, 16);

        // Check if TX is confirmed
        const txData = await rpc('btc_getTransactionReceipt', [TX_HASH]);
        if (txData.result && !txData.error) {
            const tx = txData.result;
            const revert = tx.rawRevert
                ? Buffer.from(tx.rawRevert, 'base64').toString('utf8')
                : null;

            if (revert) {
                console.log(`\nTX CONFIRMED but REVERTED at block ${blockNum}:`);
                console.log(`  Revert: ${revert}`);
                process.exit(1);
            }

            console.log(`\nTX CONFIRMED at block ${blockNum}!`);
            console.log(`  Gas used: ${tx.gasUsed}`);
            console.log(`  Events: ${tx.events?.length || 0}`);
            confirmed = true;
            break;
        }

        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stdout.write(`\r  Block ${blockNum} | ${elapsed}s elapsed | waiting...    `);
        await new Promise((r) => setTimeout(r, 15000));
    }

    if (!confirmed) {
        console.log('\n\nTimeout waiting for confirmation.');
        process.exit(1);
    }

    // Check ML-DSA key status
    console.log('\nChecking ML-DSA key status...');
    const keyData = await rpc('btc_getPublicKeyInfo', [ADDRESS]);
    const info = keyData.result;
    if (info) {
        console.log('  tweakedPubkey:', info.tweakedPubkey?.slice(0, 20) + '...');
        console.log('  p2tr:', info.p2tr);
        console.log('  mldsaHashedPublicKey:', info.mldsaHashedPublicKey || 'NOT LINKED');
        console.log('  mldsaPublicKey:', info.mldsaPublicKey ? `${info.mldsaPublicKey.slice(0, 20)}... (${info.mldsaPublicKey.length} chars)` : 'NOT LINKED');

        if (info.mldsaHashedPublicKey) {
            console.log('\n  ML-DSA KEY SUCCESSFULLY LINKED!');
            console.log('  Ready to deploy BAMPL contract.');
        } else {
            console.log('\n  ML-DSA key NOT linked. TX may have processed but linking failed.');
        }
    } else {
        console.log('  No key info found. Error:', JSON.stringify(keyData.error));
    }
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
