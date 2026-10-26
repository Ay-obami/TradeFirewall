import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMinedTransactionEvidence } from '../../src/execution/receipt-evidence.ts';

const account = '0x1111111111111111111111111111111111111111' as const;
const router = '0x2222222222222222222222222222222222222222' as const;
const hash = `0x${'a'.repeat(64)}` as `0x${string}`;
const receipt = { transactionHash: hash, from: account, to: router, status: 'success' as const, blockNumber: 123456n };
const args = { chainId: 50383, account, transactionHash: hash };

test('produces mined transaction evidence but never asserts a perps fill', async () => {
  const result = await verifyMinedTransactionEvidence({
    async getChainId() { return 50383; },
    async getTransactionReceipt() { return receipt; },
  }, args);
  assert.deepEqual(result, {
    kind: 'mined_transaction',
    chainId: 50383,
    transactionHash: hash,
    sender: account,
    destination: router,
    blockNumber: 123456n,
    status: 'success',
    perpsOrderConfirmed: false,
  });
});

test('refuses mismatched RPC chain, hash, or sender as evidence', async () => {
  await assert.rejects(verifyMinedTransactionEvidence({
    async getChainId() { return 50312; },
    async getTransactionReceipt() { return receipt; },
  }, args), /RECEIPT_WRONG_CHAIN/);
  await assert.rejects(verifyMinedTransactionEvidence({
    async getChainId() { return 50383; },
    async getTransactionReceipt() { return { ...receipt, transactionHash: `0x${'b'.repeat(64)}` }; },
  }, args), /RECEIPT_HASH_MISMATCH/);
  await assert.rejects(verifyMinedTransactionEvidence({
    async getChainId() { return 50383; },
    async getTransactionReceipt() { return { ...receipt, from: router }; },
  }, args), /RECEIPT_SENDER_MISMATCH/);
});

test('missing, reverted, unmined or malformed receipt cannot be submitted as success proof', async () => {
  for (const value of [null, { ...receipt, status: 'reverted' }, { ...receipt, blockNumber: null }, { ...receipt, to: null }]) {
    await assert.rejects(verifyMinedTransactionEvidence({
      async getChainId() { return 50383; },
      async getTransactionReceipt() { return value; },
    }, args), /RECEIPT_NOT_VERIFIED/);
  }
});

test('rejects malformed caller proof inputs before contacting RPC', async () => {
  await assert.rejects(verifyMinedTransactionEvidence({
    async getChainId() { throw new Error('unexpected'); },
    async getTransactionReceipt() { throw new Error('unexpected'); },
  }, { ...args, transactionHash: 'garbage' as `0x${string}` }), /RECEIPT_INPUT_INVALID/);
});
