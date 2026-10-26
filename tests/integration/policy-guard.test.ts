import assert from 'node:assert/strict';
import test from 'node:test';
import { createPolicyGuardedExecutor } from '../../src/integration/policy-guard.ts';
import type { MarketSnapshot, TradeIntent } from '../../src/adapter/guarded-executor.ts';
import type { RiskPolicy } from '../../src/policy/evaluate.ts';

const intent: TradeIntent = {
  account: '0x1111111111111111111111111111111111111111',
  market: '0x2222222222222222222222222222222222222222',
  side: 'buy', orderType: 'limit', priceRaw: 100_000_000n,
  quantityRaw: 1_000_000n, clientOrderId: 'agent-01',
};
const snapshot: MarketSnapshot = {
  chainId: 50383, account: intent.account, market: intent.market,
  blockNumber: 5n, observedAtMs: 1000, markPriceRaw: 100_000_000n,
  availableMarginRaw: 100_000_000n, currentPositionRaw: 0n, snapshotId: 'block5',
};
const policy: RiskPolicy = {
  allowedMarkets: ['BTC-PERP'], maxLeverageBps: 50000,
  maxOrderNotionalUsd6: '100000000', maxPositionNotionalUsd6: '200000000',
  maxSlippageBps: 100, maxDailyLossUsd6: '50000000', maxSnapshotAgeMs: 1000,
};

function setup(options: { maxOrder?: string; stale?: boolean; absentQuote?: boolean; market?: string } = {}) {
  const submissions: TradeIntent[] = [];
  const guard = createPolicyGuardedExecutor({
    readSnapshot: async () => snapshot,
    submitOrder: async (trade) => {
      submissions.push(trade);
      return { transactionHash: '0x' + '12'.repeat(32) as `0x${string}` };
    },
    nowMs: () => 1100,
    policy: { ...policy, maxOrderNotionalUsd6: options.maxOrder ?? policy.maxOrderNotionalUsd6 },
    resolveRisk: async (_trade, state) => {
      if (options.absentQuote) throw new Error('UNAVAILABLE_PRICE_DECIMALS');
      return {
        marketSymbol: options.market ?? 'BTC-PERP',
        leverageBps: 20000,
        slippageBps: 50,
        lotSizeRaw: 100_000n,
        riskContext: {
          nowMs: 1100,
          observedAtMs: options.stale ? 0 : state.observedAtMs,
          signedPositionUsd6: '10000000',
          dailyPnlUsd6: '-1000000',
          equityUsd6: '100000000',
        },
        // Trusted quote: 100 USDso for 1,000,000 raw units, exact to 6 decimals.
        quoteNotionalUsd6: (quantityRaw: bigint) => (quantityRaw * 100n).toString(),
      };
    },
  });
  return { guard, submissions };
}

test('permitted trade can prepare then dry-run without submitting a transaction', async () => {
  const { guard, submissions } = setup();
  const prepared = await guard.prepare(intent);
  assert.equal(prepared.action, 'approved');
  if (prepared.action !== 'approved') return;
  assert.equal(prepared.intent.quantityRaw, intent.quantityRaw);
  const result = await guard.dryRun(prepared.approvalId);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.intent.quantityRaw, 1_000_000n);
  assert.equal(submissions.length, 0);
});

test('policy blocks a forbidden market and never creates executable approval', async () => {
  const { guard, submissions } = setup({ market: 'ZEC-PERP' });
  const prepared = await guard.prepare(intent);
  assert.equal(prepared.action, 'block');
  if (prepared.action !== 'block') return;
  assert.match(prepared.reason, /MARKET_DENIED/);
  assert.equal(submissions.length, 0);
});

test('policy resizes quantity to the precise allowed USD6 notional rounded to market lot', async () => {
  const { guard, submissions } = setup({ maxOrder: '55000000' });
  const prepared = await guard.prepare(intent);
  assert.equal(prepared.action, 'approved');
  if (prepared.action !== 'approved') return;
  assert.equal(prepared.intent.quantityRaw, 500_000n);
  assert.match(prepared.reason, /ORDER_CAP/);
  await guard.dryRun(prepared.approvalId);
  assert.equal(submissions.length, 0);
});

test('conversion failure and mismatched observed timestamp fail closed', async () => {
  await assert.rejects(setup({ absentQuote: true }).guard.prepare(intent), /UNAVAILABLE_PRICE_DECIMALS/);
  await assert.rejects(setup({ stale: true }).guard.prepare(intent), /RISK_SNAPSHOT_MISMATCH/);
});

test('risk adapter never infers decimals or accepts invalid market lot precision', async () => {
  const source = setup();
  await assert.rejects(source.guard.prepare({ ...intent, quantityRaw: 1_050_000n }), /INVALID_MARKET_LOT/);
});
