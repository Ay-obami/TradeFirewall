import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateIntent, defaultLimits } from '../demo-engine.mjs';

const base = { market: 'BTC-PERP', side: 'LONG', notional: 850, leverage: 5, slippageBps: 25, markAgeSeconds: 2, dailyLoss: 80, positionNotional: 0, equity: 5000 };

test('safe trade is allowed', () => {
  assert.equal(evaluateIntent(base, defaultLimits).decision, 'ALLOW');
});

test('oversized trade is resized with a bounded resulting notional', () => {
  const result = evaluateIntent({ ...base, notional: 3200 }, defaultLimits);
  assert.equal(result.decision, 'RESIZE');
  assert.equal(result.approvedNotional, defaultLimits.maxOrderNotional);
});

test('stale pricing fails closed', () => {
  assert.equal(evaluateIntent({ ...base, markAgeSeconds: 40 }, defaultLimits).decision, 'BLOCK');
});

test('daily loss and leverage violations fail closed', () => {
  assert.equal(evaluateIntent({ ...base, dailyLoss: 400 }, defaultLimits).decision, 'BLOCK');
  assert.equal(evaluateIntent({ ...base, leverage: 20 }, defaultLimits).decision, 'BLOCK');
});

test('invalid or hostile values never pass', () => {
  assert.equal(evaluateIntent({ ...base, notional: -1 }, defaultLimits).decision, 'BLOCK');
  assert.equal(evaluateIntent({ ...base, market: 'UNKNOWN-PERP' }, defaultLimits).decision, 'BLOCK');
});

test('badly configured risk cap fails closed', () => {
  assert.equal(evaluateIntent(base, { ...defaultLimits, maxOrderNotional: 0 }).decision, 'BLOCK');
});
