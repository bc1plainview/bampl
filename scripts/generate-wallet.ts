import { Mnemonic } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Generate a 24-word mnemonic (256-bit entropy)
const mnemonic = Mnemonic.generate(256, '', networks.opnetTestnet);
const phrase = mnemonic.phrase;

console.log('='.repeat(60));
console.log('  BAMPL Deployer Wallet Generated');
console.log('='.repeat(60));
console.log('');
console.log('Mnemonic (SAVE THIS - DO NOT SHARE):');
console.log(`  ${phrase}`);
console.log('');

// Derive the first account for OPNet testnet
const wallet = mnemonic.derive(0);

console.log(`P2TR Address (send funds here):`);
console.log(`  ${wallet.p2tr}`);
console.log('');
console.log(`OPNet Address:`);
console.log(`  ${wallet.address.toHex()}`);
console.log('');
console.log('='.repeat(60));

// Clean up
wallet.zeroize();
