import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runScenario, runSuite, serializeEvidence, type Scenario, type Gate } from '../../src/simulator/index.ts';
import { referenceGate } from '../../src/simulator/run-offline.ts';

const fakeGate: Gate = ({ intent, snapshot }) => {
  if (snapshot.oracleAgeMs > 10_000) return { action: 'block', reason: 'STALE_ORACLE' };
  if (snapshot.dailyLossUsd > 500) return { action: 'block', reason: 'DAILY_LOSS' };
  if (intent.slippageBps > 80) return { action: 'block', reason: 'SLIPPAGE' };
  if (intent.requestedUsd > 1_000) return { action: 'resize', approvedUsd: 1_000, reason: 'ORDER_NOTIONAL' };
  if (intent.bypassRequested) return { action: 'block', reason: 'UNAUTHORIZED_OVERRIDE' };
  return { action: 'allow', approvedUsd: intent.requestedUsd, reason: 'POLICY_OK' };
};

const base: Scenario = {
  id: 'normal', description: 'Normal proposal is allowed',
  steps: [{ tick: 1, intent: { id: 'one', account: 'a', market: 'BTC-PERP', requestedUsd: 100, slippageBps: 10 }, snapshot: { oracleAgeMs: 5, dailyLossUsd: 0 } }],
  expected: [{ action: 'allow', reason: 'POLICY_OK' }],
};

test('a run captures gate decision as evidence with no transactions', () => {
  const result = runScenario(base, fakeGate);
  assert.equal(result.passed, true);
  assert.deepEqual(result.metrics, { proposed: 1, allowed: 1, resized: 0, blocked: 0, failedChecks: 0 });
  assert.equal(result.events[0].decision.approvedUsd, 100);
  assert.equal(result.events[0].txHash, null);
  assert.equal(result.mode, 'OFFLINE_SIMULATION');
});

test('runaway size is resized by gate and measured separately from block', () => {
  const scenario = { ...base, id: 'runaway', steps: [{ ...base.steps[0], intent: { ...base.steps[0].intent, requestedUsd: 2_000 } }], expected: [{ action: 'resize', reason: 'ORDER_NOTIONAL' }] } satisfies Scenario;
  const result = runScenario(scenario, fakeGate);
  assert.equal(result.events[0].decision.approvedUsd, 1_000);
  assert.deepEqual(result.metrics, { proposed: 1, allowed: 0, resized: 1, blocked: 0, failedChecks: 0 });
});

test('stale oracle and daily-loss and slippage proposals fail closed', () => {
  const result = runSuite([
    { ...base, id: 'stale', steps: [{ ...base.steps[0], snapshot: { oracleAgeMs: 10_001, dailyLossUsd: 0 } }], expected: [{ action: 'block', reason: 'STALE_ORACLE' }] },
    { ...base, id: 'loss', steps: [{ ...base.steps[0], snapshot: { oracleAgeMs: 1, dailyLossUsd: 501 } }], expected: [{ action: 'block', reason: 'DAILY_LOSS' }] },
    { ...base, id: 'slippage', steps: [{ ...base.steps[0], intent: { ...base.steps[0].intent, slippageBps: 81 } }], expected: [{ action: 'block', reason: 'SLIPPAGE' }] },
  ], fakeGate);
  assert.equal(result.passed, true);
  assert.equal(result.metrics.blocked, 3);
});

test('replay of the same intent id is rejected before policy evaluation', () => {
  const scenario: Scenario = { ...base, id: 'replay', steps: [base.steps[0], { ...base.steps[0], tick: 2 }], expected: [{ action: 'allow', reason: 'POLICY_OK' }, { action: 'block', reason: 'DUPLICATE_INTENT' }] };
  const result = runScenario(scenario, fakeGate);
  assert.equal(result.passed, true);
  assert.equal(result.events[1].decision.reason, 'DUPLICATE_INTENT');
});

test('same-tick conflicting proposals on one account cannot both pass', () => {
  const next = { ...base.steps[0], intent: { ...base.steps[0].intent, id: 'two' } };
  const scenario: Scenario = { ...base, id: 'concurrent', steps: [base.steps[0], next], expected: [{ action: 'allow', reason: 'POLICY_OK' }, { action: 'block', reason: 'CONCURRENT_ACCOUNT_INTENT' }] };
  const result = runScenario(scenario, fakeGate);
  assert.equal(result.passed, true);
  assert.equal(result.events[1].decision.reason, 'CONCURRENT_ACCOUNT_INTENT');
});

test('an agent override request is not silently honored', () => {
  const scenario: Scenario = { ...base, id: 'override', steps: [{ ...base.steps[0], intent: { ...base.steps[0].intent, bypassRequested: true } }], expected: [{ action: 'block', reason: 'UNAUTHORIZED_OVERRIDE' }] };
  assert.equal(runScenario(scenario, fakeGate).passed, true);
});

test('evaluation exceptions fail closed, never allowing execution', () => {
  const outcome = runScenario({ ...base, expected: [{ action: 'block', reason: 'GATE_EVALUATION_FAILED' }] }, () => { throw new Error('RPC outage'); });
  assert.equal(outcome.passed, true);
  assert.equal(outcome.events[0].decision.reason, 'GATE_EVALUATION_FAILED');
});

test('invalid scenario output is flagged and JSON evidence is deterministic', () => {
  const bad = runScenario({ ...base, expected: [{ action: 'block', reason: 'POLICY_OK' }] }, fakeGate);
  assert.equal(bad.passed, false);
  assert.equal(bad.metrics.failedChecks, 1);
  const first = serializeEvidence(runSuite([base], fakeGate));
  const second = serializeEvidence(runSuite([base], fakeGate));
  assert.equal(first, second);
  assert.ok(first.includes('OFFLINE_SIMULATION'));
});

test('committed adversarial fixtures generate reproducible parseable JSON evidence', () => {
  const scenarios = JSON.parse(readFileSync('fixtures/adversarial-scenarios.json', 'utf8')) as Scenario[];
  const report = JSON.parse(serializeEvidence(runSuite(scenarios, referenceGate)));
  assert.equal(report.mode, 'OFFLINE_SIMULATION');
  assert.equal(report.passed, true);
  assert.equal(report.results.length, 7);
  assert.equal(report.metrics.blocked, 6);
  assert.equal(report.metrics.resized, 1);
  assert.equal(report.metrics.allowed, 2);
  assert.equal(report.metrics.failedChecks, 0);
  assert.ok(report.results.every((item: { events: Array<{ txHash: null }> }) => item.events.every(event => event.txHash === null)));
});
