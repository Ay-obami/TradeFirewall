import test from 'node:test';
import assert from 'node:assert/strict';
import { createDreamdexExecutionPort } from '../../src/execution/sdk-execution.ts';
import type { TradeIntent } from '../../src/adapter/guarded-executor.ts';

const account = '0x1111111111111111111111111111111111111111' as const;
const pool = '0x2222222222222222222222222222222222222222' as const;
const hash = `0x${'a'.repeat(64)}` as `0x${string}`;
const intent: TradeIntent = { account, market: pool, side: 'buy', orderType: 'limit', priceRaw: 100n, quantityRaw: 20n, clientOrderId: 'order-one' };
const metadata = { pool, chainId: 50383, tickSize: 10n, lotSize: 5n, minQuantity: 5n, maxQuantity: 1000n };

function setup(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  const sdk = {
    chainId: 50383,
    walletAddress: account,
    trader: { async placePerpOrder(input: unknown) { calls.push(input); return { transactionHash: hash }; } },
    async lookupMarket() { return metadata; },
    ...overrides,
  };
  return { port: createDreamdexExecutionPort(sdk), calls };
}

test('converts guarded limit intent into documented SDK placePerpOrder fields', async () => {
  const { port, calls } = setup();
  assert.deepEqual(await port.submitOrder(intent), { transactionHash: hash });
  assert.deepEqual(calls, [{ pool, isBid: true, price: 100n, quantity: 20n }]);
});

test('dry-run builds identical params without broadcasting', async () => {
  const { port, calls } = setup();
  assert.deepEqual(await port.preview(intent), { pool, isBid: true, price: 100n, quantity: 20n });
  assert.equal(calls.length, 0);
});

test('sell intent maps to ask direction without floating-point conversion', async () => {
  const { port, calls } = setup();
  await port.submitOrder({ ...intent, side: 'sell', clientOrderId: 'sell-one' });
  assert.deepEqual(calls, [{ pool, isBid: false, price: 100n, quantity: 20n }]);
});

test('disallows wrong chain and signer account', async () => {
  const wrong = setup({ chainId: 50312 });
  await assert.rejects(wrong.port.submitOrder(intent), /WRONG_CHAIN/);
  const other = setup({ walletAddress: '0x3333333333333333333333333333333333333333' });
  await assert.rejects(other.port.submitOrder(intent), /SIGNER_ACCOUNT_MISMATCH/);
});

test('refuses ambiguous SDK market order semantics', async () => {
  const { port, calls } = setup();
  await assert.rejects(port.submitOrder({ ...intent, orderType: 'market' }), /UNSUPPORTED_ORDER_TYPE/);
  assert.equal(calls.length, 0);
});

test('refuses non-tick prices, non-lot quantities and undersized orders', async () => {
  const { port, calls } = setup();
  await assert.rejects(port.submitOrder({ ...intent, priceRaw: 101n }), /PRICE_NOT_ON_TICK/);
  await assert.rejects(port.submitOrder({ ...intent, quantityRaw: 21n }), /QUANTITY_NOT_ON_LOT/);
  await assert.rejects(port.submitOrder({ ...intent, quantityRaw: 0n }), /INVALID_ORDER/);
  assert.equal(calls.length, 0);
});

test('fails closed when market metadata is missing or mismatched', async () => {
  const missing = setup({ async lookupMarket() { return undefined; } });
  await assert.rejects(missing.port.submitOrder(intent), /MARKET_NOT_VERIFIED/);
  const mismatch = setup({ async lookupMarket() { return { ...metadata, pool: account }; } });
  await assert.rejects(mismatch.port.submitOrder(intent), /MARKET_NOT_VERIFIED/);
});

test('refuses a duplicate client order id even after successful submission', async () => {
  const { port, calls } = setup();
  await port.submitOrder(intent);
  await assert.rejects(port.submitOrder(intent), /DUPLICATE_INTENT/);
  assert.equal(calls.length, 1);
});

test('concurrent submissions of one client order ID can broadcast at most once', async () => {
  const { port, calls } = setup();
  const results = await Promise.allSettled([port.submitOrder(intent), port.submitOrder(intent)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && /DUPLICATE_INTENT/.test(String(result.reason))).length, 1);
  assert.equal(calls.length, 1);
});

test('no rebroadcast after ambiguous SDK failure without receipt reconciliation', async () => {
  const { port, calls } = setup({ trader: { async placePerpOrder(input: unknown) { calls.push(input); throw new Error('RPC timeout'); } } });
  await assert.rejects(port.submitOrder(intent), /AMBIGUOUS_BROADCAST/);
  await assert.rejects(port.submitOrder(intent), /DUPLICATE_INTENT/);
  assert.equal(calls.length, 1);
});

test('invalid transaction result never counts as confirmed evidence', async () => {
  const { port } = setup({ trader: { async placePerpOrder() { return { transactionHash: 'not-a-hash' }; } } });
  await assert.rejects(port.submitOrder(intent), /INVALID_TRANSACTION_HASH/);
});
