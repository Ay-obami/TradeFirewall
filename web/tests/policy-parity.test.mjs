import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrade } from '../../src/policy/evaluate.ts';
import { evaluateIntent, defaultLimits } from '../demo-engine.mjs';

const base = {
  market: 'BTC-PERP', side: 'LONG', notional: 850, leverage: 5,
  slippageBps: 25, markAgeSeconds: 2, dailyLoss: 80,
  positionNotional: 0, equity: 5000,
};

function usd6(value) { return String(BigInt(value) * 1_000_000n); }

function truePolicy(intent, limits) {
  const now = 1_700_000_000_000;
  const result = evaluateTrade({
    market: intent.market,
    side: intent.side === 'LONG' ? 'buy' : 'sell',
    notionalUsd6: usd6(intent.notional),
    leverageBps: intent.leverage * 10000,
    slippageBps: intent.slippageBps,
    reduceOnly: false,
  }, {
    nowMs: now,
    observedAtMs: now - intent.markAgeSeconds * 1000,
    signedPositionUsd6: usd6(intent.positionNotional),
    dailyPnlUsd6: '-' + usd6(intent.dailyLoss),
    equityUsd6: usd6(intent.equity),
  }, {
    allowedMarkets: limits.markets,
    maxLeverageBps: limits.maxLeverage * 10000,
    maxOrderNotionalUsd6: usd6(limits.maxOrderNotional),
    maxPositionNotionalUsd6: usd6(limits.maxPositionNotional),
    maxSlippageBps: limits.maxSlippageBps,
    maxDailyLossUsd6: usd6(limits.maxDailyLoss),
    maxSnapshotAgeMs: limits.maxMarkAgeSeconds * 1000,
  });
  return { decision: result.action.toUpperCase(), approvedNotional: Number(BigInt(result.approvedNotionalUsd6) / 1_000_000n), reasons: result.reasons };
}

test('browser risk decisions stay in parity with production policy under adversarial scenarios', () => {
  const limits = { ...defaultLimits, maxPositionNotional: 2500 };
  const cases = [
    base,
    { ...base, notional: 3200 },
    { ...base, notional: 1800, positionNotional: 1500 },
    { ...base, side: 'SHORT', positionNotional: -2000 },
    { ...base, market: 'HYPE-PERP' },
    { ...base, markAgeSeconds: 16 },
    { ...base, dailyLoss: 301 },
    { ...base, dailyLoss: 300 },
    { ...base, leverage: 11 },
    { ...base, slippageBps: 51 },
  ];
  for (const intent of cases) {
    const display = evaluateIntent(intent, limits);
    const core = truePolicy(intent, limits);
    assert.equal(display.decision, core.decision, JSON.stringify(intent));
    assert.equal(display.approvedNotional, core.approvedNotional, JSON.stringify(intent));
    if (core.reasons.length) assert.equal(display.reason, core.reasons[0]);
  }
});

test('malformed missing account state fails closed in the browser', () => {
  assert.equal(evaluateIntent({ ...base, equity: undefined }, defaultLimits).decision, 'BLOCK');
});

test('position capacity resizes rather than silently exceeding trader exposure policy', () => {
  const result = evaluateIntent({ ...base, notional: 1200, positionNotional: 1500 }, { ...defaultLimits, maxPositionNotional: 2500 });
  assert.equal(result.decision, 'RESIZE');
  assert.equal(result.approvedNotional, 1000);
  assert.equal(result.reason, 'POSITION_CAP');
});
