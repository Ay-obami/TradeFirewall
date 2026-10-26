import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTrade, type RiskContext, type RiskPolicy, type TradeIntent } from '../../src/policy/evaluate.ts';

const policy: RiskPolicy = {
  allowedMarkets: ['BTC-PERP', 'ETH-PERP'],
  maxLeverageBps: 50000,
  maxOrderNotionalUsd6: '100000000',
  maxPositionNotionalUsd6: '250000000',
  maxSlippageBps: 100,
  maxDailyLossUsd6: '25000000',
  maxSnapshotAgeMs: 5000,
};

const intent: TradeIntent = {
  market: 'BTC-PERP',
  side: 'buy',
  notionalUsd6: '50000000',
  leverageBps: 20000,
  slippageBps: 50,
  reduceOnly: false,
};

const context: RiskContext = {
  nowMs: 100000,
  observedAtMs: 99000,
  signedPositionUsd6: '100000000',
  dailyPnlUsd6: '-10000000',
  equityUsd6: '250000000',
};

test('permits a fresh risk-compliant trade without changing its notional', () => {
  assert.deepEqual(evaluateTrade(intent, context, policy), {
    action: 'allow',
    approvedNotionalUsd6: '50000000',
    reasons: [],
  });
});

test('blocks trades on markets not on the allowlist', () => {
  const result = evaluateTrade({ ...intent, market: 'DOGE-PERP' }, context, policy);
  assert.equal(result.action, 'block');
  assert.ok(result.reasons.includes('MARKET_DENIED'));
});

test('blocks forbidden leverage, excessive slippage, and daily loss', () => {
  assert.ok(evaluateTrade({ ...intent, leverageBps: 60000 }, context, policy).reasons.includes('LEVERAGE_EXCEEDED'));
  assert.ok(evaluateTrade({ ...intent, slippageBps: 101 }, context, policy).reasons.includes('SLIPPAGE_EXCEEDED'));
  assert.ok(evaluateTrade(intent, { ...context, dailyPnlUsd6: '-25000001' }, policy).reasons.includes('DAILY_LOSS_EXCEEDED'));
});

test('resizes an otherwise valid trade to the strictest order and position caps', () => {
  const result = evaluateTrade({ ...intent, notionalUsd6: '200000000' }, { ...context, signedPositionUsd6: '180000000' }, policy);
  assert.deepEqual(result, {
    action: 'resize',
    approvedNotionalUsd6: '70000000',
    reasons: ['ORDER_CAP', 'POSITION_CAP'],
  });
});

test('blocks a buy when the existing position already consumes long capacity', () => {
  const result = evaluateTrade(intent, { ...context, signedPositionUsd6: '250000000' }, policy);
  assert.equal(result.action, 'block');
  assert.ok(result.reasons.includes('POSITION_CAP'));
});

test('allows reducing an existing short, but reduce-only never flips it long', () => {
  const short = { ...context, signedPositionUsd6: '-20000000' };
  assert.deepEqual(evaluateTrade({ ...intent, notionalUsd6: '30000000', reduceOnly: true }, short, policy), {
    action: 'resize', approvedNotionalUsd6: '20000000', reasons: ['REDUCE_ONLY_CAP'],
  });
  assert.equal(evaluateTrade({ ...intent, reduceOnly: true, side: 'sell' }, short, policy).action, 'block');
});

test('fails closed on stale or future-dated state', () => {
  assert.ok(evaluateTrade(intent, { ...context, observedAtMs: 94999 }, policy).reasons.includes('STALE_STATE'));
  assert.ok(evaluateTrade(intent, { ...context, observedAtMs: 100001 }, policy).reasons.includes('STALE_STATE'));
});

test('fails closed on missing, malformed, negative or zero-sized inputs', () => {
  const bad = [
    { ...intent, notionalUsd6: '5.0' },
    { ...intent, notionalUsd6: '-10' },
    { ...intent, notionalUsd6: '0' },
    { ...intent, leverageBps: Number.NaN },
    { ...intent, slippageBps: -1 },
  ];
  for (const suspect of bad) {
    assert.equal(evaluateTrade(suspect, context, policy).action, 'block');
  }
  assert.ok(evaluateTrade(intent, { ...context, signedPositionUsd6: '' }, policy).reasons.includes('INVALID_INPUT'));
});

test('calculates exact boundaries on integer micro-USD values rather than floating point', () => {
  const huge = { ...intent, notionalUsd6: '90071992547409930' };
  const bigPolicy = { ...policy, maxOrderNotionalUsd6: '90071992547409931', maxPositionNotionalUsd6: '90071992547409931' };
  const result = evaluateTrade(huge, { ...context, signedPositionUsd6: '0' }, bigPolicy);
  assert.equal(result.action, 'allow');
  assert.equal(result.approvedNotionalUsd6, '90071992547409930');
});

test('accepts exact cap boundaries and the maximum configured daily drawdown', () => {
  const result = evaluateTrade({ ...intent, notionalUsd6: '100000000' }, {
    ...context,
    signedPositionUsd6: '150000000',
    dailyPnlUsd6: '-25000000',
    observedAtMs: 95000,
  }, policy);
  assert.equal(result.action, 'allow');
});

test('rejects malformed policy, missing state and zero equity rather than throwing', () => {
  assert.deepEqual(evaluateTrade(intent, context, { ...policy, maxOrderNotionalUsd6: 'NaN' }), {
    action: 'block', approvedNotionalUsd6: '0', reasons: ['INVALID_INPUT'],
  });
  assert.equal(evaluateTrade(intent, { ...context, equityUsd6: '0' }, policy).action, 'block');
  assert.equal(evaluateTrade(intent, undefined as unknown as RiskContext, policy).action, 'block');
});

test('a reduce-only sell closes no more than an existing long, with no accidental short', () => {
  const result = evaluateTrade({ ...intent, side: 'sell', reduceOnly: true, notionalUsd6: '99000000' }, {
    ...context, signedPositionUsd6: '9000000',
  }, policy);
  assert.equal(result.action, 'resize');
  assert.equal(result.approvedNotionalUsd6, '9000000');
  assert.deepEqual(result.reasons, ['REDUCE_ONLY_CAP']);
});
