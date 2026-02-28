import { Address } from '@btc-vision/transaction';

// Test: can we construct an Address from just 32 bytes (the MLDSA hash)?
const fakeHash = 'f7b5845eaaa37c1661a19c1fd07ad179e338bb6256ed49c54dda01c29d821fde';
const hashBytes = Buffer.from(fakeHash, 'hex');

// Try different constructors
console.log('Address prototype:', Object.getOwnPropertyNames(Address.prototype));
console.log('Address static:', Object.getOwnPropertyNames(Address));

// Check if Address extends Uint8Array
try {
    // @ts-ignore
    const a = new Address(hashBytes);
    console.log('new Address(buffer) works:', !!a);
    console.log('  type:', typeof a);
    console.log('  keys:', Object.keys(a).slice(0, 5));
} catch (e) {
    console.log('new Address(buffer) error:', (e as Error).message?.slice(0, 200));
}

// Check Address.dead or other static methods
try {
    const dead = Address.dead();
    console.log('Address.dead():', dead?.toString?.()?.slice(0, 40));
    console.log('  type:', typeof dead, dead?.constructor?.name);
    const buf = Buffer.from(dead as any);
    console.log('  bytes:', buf.toString('hex'));
} catch (e) {
    console.log('Address.dead() error:', (e as Error).message?.slice(0, 200));
}

// Try setting bytes manually on a dead address
try {
    const addr = Address.dead();
    for (let i = 0; i < 32; i++) {
        (addr as any)[i] = hashBytes[i];
    }
    console.log('Manual byte set:', Buffer.from(addr as any).toString('hex'));
} catch (e) {
    console.log('Manual set error:', (e as Error).message?.slice(0, 200));
}
