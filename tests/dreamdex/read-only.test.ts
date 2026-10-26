import assert from 'node:assert/strict';
import test from 'node:test';
import { createDreamdexReadOnly, parseRawUnits, formatRawUnits } from '../../src/dreamdex/read-only.ts';

const ACCOUNT = '0x1111111111111111111111111111111111111111' as const;
const POOL = '0x2222222222222222222222222222222222222222' as const;
const BANK = '0x3333333333333333333333333333333333333333' as const;
const QUOTE = '0x4444444444444444444444444444444444444444' as const;
const market = {
  baseSymbol: 'NEAR', poolAddress: POOL, marginBank: BANK, quoteToken: QUOTE,
  baseDecimals: 24, quoteDecimals: 18, tickSize: 100_000_000_000_000_000n,
  lotSize: 1_000_000_000_000_000_000_000n,
  minQuantity: 2_000_000_000_000_000_000_000n,
};

function setup(overrides: Record<string, unknown> = {}) {
  const queried: unknown[] = [];
  const sdk = {
    client: {
      listPerpMarkets: async () => [market],
      getPerpSystemConfig: async () => ({ collateral: QUOTE }),
      getMaxPerpOrderSize: async (params: unknown) => {
        queried.push(params);
        return { priceable: true, placeable: true, maxQuantity: 100_000_000_000_000_000_000_000n, limitedBy: 'margin' };
      },
    },
  };
  const adapter = createDreamdexReadOnly({
    sdk,
    chainId: 50383,
    nowMs: () => 10_000,
    readAccountSnapshot: async () => ({
      account: ACCOUNT, market: POOL, chainId: 50383, blockNumber: 100n,
      observedAtMs: 9_999, snapshotId: 'block100-a', availableMarginRaw: 1_000_000n,
      currentPositionRaw: 0n, markPriceRaw: 5_000_000_000_000_000_000n,
    }),
    ...overrides,
  });
  return { adapter, queried };
}

test('exact unit conversion supports 24-decimal assets without floating-point rounding', () => {
  assert.equal(parseRawUnits('0.000000000000000000000001', 24), 1n);
  assert.equal(parseRawUnits('1.23', 6), 1_230_000n);
  assert.equal(formatRawUnits(1n, 24), '0.000000000000000000000001');
  assert.equal(formatRawUnits(1_230_000n, 6), '1.23');
  assert.throws(() => parseRawUnits('0.0000001', 6), /PRECISION_EXCEEDED/);
  assert.throws(() => parseRawUnits('1e6', 6), /INVALID_DECIMAL/);
});

test('discover market validates on-chain collateral against market quote token', async () => {
  const { adapter } = setup();
  assert.deepEqual(await adapter.getMarket('NEAR'), market);
});

test('quote uses actual pool, margin bank and market-specific 18/24 decimals', async () => {
  const { adapter, queried } = setup();
  const quote = await adapter.quote('NEAR', ACCOUNT, 'buy', '5.1', '0.01');
  assert.equal(quote.priceRaw, 5_100_000_000_000_000_000n);
  assert.equal(quote.quantityRaw, 10_000_000_000_000_000_000_000n);
  assert.equal(quote.maxQuantityRaw, 100_000_000_000_000_000_000_000n);
  assert.deepEqual(queried[0], {
    pool: POOL, marginBank: BANK, account: ACCOUNT,
    isBid: true, price: 5_100_000_000_000_000_000n,
  });
});

test('quote refuses stale mark and refused SDK margin quote', async () => {
  const { adapter } = setup({
    sdk: { client: {
      listPerpMarkets: async () => [market],
      getPerpSystemConfig: async () => ({ collateral: QUOTE }),
      getMaxPerpOrderSize: async () => ({ priceable: false, placeable: false, maxQuantity: 0n, limitedBy: 'staleMark' }),
    } },
  });
  await assert.rejects(adapter.quote('NEAR', ACCOUNT, 'buy', '5.1', '0.01'), /STALE_MARK/);
});

test('snapshot validates Hideki identity and time freshness before returning a risk-state snapshot', async () => {
  const { adapter } = setup();
  const snapshot = await adapter.readSnapshot({ account: ACCOUNT, market: POOL });
  assert.equal(snapshot.chainId, 50383);
  assert.equal(snapshot.availableMarginRaw, 1_000_000n);
  await assert.rejects(setup({ chainId: 50312 }).adapter.readSnapshot({ account: ACCOUNT, market: POOL }), /WRONG_CHAIN/);
  const stale = setup({ readAccountSnapshot: async () => ({
    account: ACCOUNT, market: POOL, chainId: 50383, blockNumber: 100n,
    observedAtMs: 0, snapshotId: 'old', availableMarginRaw: 1_000_000n,
    currentPositionRaw: 0n, markPriceRaw: 5_000_000_000_000_000_000n,
  }) });
  await assert.rejects(stale.adapter.readSnapshot({ account: ACCOUNT, market: POOL }), /STALE_ACCOUNT_SNAPSHOT/);
});

test('market discovery refuses wrong collateral and unsupported symbols', async () => {
  const { adapter } = setup({
    sdk: { client: {
      listPerpMarkets: async () => [market],
      getPerpSystemConfig: async () => ({ collateral: ACCOUNT }),
      getMaxPerpOrderSize: async () => ({ priceable: true, placeable: true, maxQuantity: 1n }),
    } },
  });
  await assert.rejects(adapter.getMarket('NEAR'), /COLLATERAL_MISMATCH/);
  await assert.rejects(adapter.getMarket('SOMI'), /MARKET_NOT_FOUND/);
});

test('quote rejects invalid size, market tick and market minimum without calling SDK sizing', async () => {
  const { adapter, queried } = setup();
  await assert.rejects(adapter.quote('NEAR', ACCOUNT, 'buy', '5.11', '0.01'), /PRICE_TICK_MISMATCH/);
  await assert.rejects(adapter.quote('NEAR', ACCOUNT, 'buy', '5.1', '0.0001'), /MIN_QUANTITY/);
  await assert.rejects(adapter.quote('NEAR', ACCOUNT, 'buy', '5.1', '0.0021'), /LOT_SIZE_MISMATCH/);
  assert.equal(queried.length, 0);
});
