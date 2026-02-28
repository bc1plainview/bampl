import 'dotenv/config';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = process.env.RPC_URL || 'https://testnet.opnet.org';
const CONTRACT_ADDRESS = 'opt1sqra07v3clulmps9krt57rngcthad2wxlyqqxrhzl';
const DEPLOY_TX = '4fcfc2140afb7006e8fa58dc9e4b9ce3c9d222a9ec7e7620e12237b4a22f5cf4';
const FUNDING_TX = '7604c8da160ef1d6ae0ab00ff15534cc0d6fac33e09a2a2aa610b58330456ddb';

async function main() {
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    console.log('Checking deployment status...\n');

    // Check current block height
    try {
        const blockHeight = await provider.getBlockCount();
        console.log(`Current block height: ${blockHeight}`);
    } catch (e) {
        console.log('Could not get block height:', (e as Error).message);
    }

    // Try to get the contract info
    try {
        const contractInfo = await provider.getContract(CONTRACT_ADDRESS);
        console.log('\nContract info:', JSON.stringify(contractInfo, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e) {
        console.log('\nContract not found yet:', (e as Error).message);
    }

    // Try to get the deployment transaction
    try {
        const txInfo = await provider.getTransaction(DEPLOY_TX);
        console.log('\nDeploy TX info:', JSON.stringify(txInfo, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2).slice(0, 500));
    } catch (e) {
        console.log('\nDeploy TX not found:', (e as Error).message);
    }

    // Try to get the funding transaction
    try {
        const fundingInfo = await provider.getTransaction(FUNDING_TX);
        console.log('\nFunding TX info:', JSON.stringify(fundingInfo, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2).slice(0, 500));
    } catch (e) {
        console.log('\nFunding TX not found:', (e as Error).message);
    }
}

main().catch((err) => {
    console.error('Error:', err);
});
