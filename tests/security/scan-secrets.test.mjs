import test from 'node:test';
import assert from 'node:assert/strict';
import { scanPathAndContents, checkFiles } from '../../scripts/security/scan-secrets.mjs';

test('rejects credential-bearing filenames even when contents look benign', () => {
  assert.deepEqual(scanPathAndContents('.env', 'RPC_URL=https://example.test'), ['credential-file']);
  assert.deepEqual(scanPathAndContents('config/operator-private-key.json', '{}'), ['credential-file']);
  assert.deepEqual(scanPathAndContents('keys/signer.age', 'encrypted'), ['credential-file']);
});

test('rejects private key assignment and mnemonic-like declarations', () => {
  const key = `0x${'a'.repeat(64)}`;
  assert.ok(scanPathAndContents('src/config.ts', `PRIVATE_KEY=${key}`).includes('private-key-value'));
  assert.ok(scanPathAndContents('config.txt', `mnemonic = "word ".repeat(12)`).length === 0);
  const phrase = [...Array(11).fill('abandon'), 'about'].join(' ');
  assert.ok(scanPathAndContents('config.txt', `MNEMONIC="${phrase}"`).includes('seed-phrase-value'));
});

test('allows public addresses and fixture placeholders', () => {
  assert.deepEqual(scanPathAndContents('docs/networks.md', 'address: 0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D'), []);
  assert.deepEqual(scanPathAndContents('src/config.ts', 'const PRIVATE_KEY = process.env.PRIVATE_KEY'), []);
  assert.deepEqual(scanPathAndContents('.env.example', 'PRIVATE_KEY=YOUR_TESTNET_ONLY_KEY'), []);
});

test('repository benign files scan clean without private material', () => {
  assert.deepEqual(checkFiles(process.cwd(), ['README.md', 'package.json']), []);
});
