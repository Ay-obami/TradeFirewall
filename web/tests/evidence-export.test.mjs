import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSimulationEvidence } from '../evidence-export.mjs';

const record = {
  time: '2026-10-26T12:00:00.000Z',
  intent: { market: 'BTC-PERP', side: 'LONG', notional: 850 },
  limits: { maxOrderNotional: 1500 },
  result: { decision: 'ALLOW', approvedNotional: 850, reason: 'WITHIN_LIMITS', reasons: [] },
  execution: 'simulation-only',
};

test('evidence export cannot be misrepresented as a live transaction', () => {
  const artifact = buildSimulationEvidence([record]);
  assert.equal(artifact.schema, 'tradefirewall.offline-evidence.v1');
  assert.equal(artifact.mode, 'OFFLINE_SIMULATION');
  assert.equal(artifact.proofType, 'POLICY_EVALUATION_ONLY');
  assert.equal(artifact.networkExecution, false);
  assert.equal(artifact.walletSigned, false);
  assert.equal(artifact.transactionHashes.length, 0);
  assert.equal(artifact.records[0].execution, 'simulation-only');
});

test('evidence export snapshots full intent, limits, and decision without modifying ledger', () => {
  const rows = [record];
  const artifact = buildSimulationEvidence(rows);
  assert.deepEqual(artifact.records, rows);
  artifact.records[0].intent.notional = 999;
  assert.equal(record.intent.notional, 850);
  assert.equal(artifact.summary.total, 1);
  assert.equal(artifact.summary.allowed, 1);
});

test('evidence export rejects malformed or forged live records', () => {
  assert.throws(() => buildSimulationEvidence([{ ...record, execution: 'broadcast' }]), /simulation-only/);
  assert.throws(() => buildSimulationEvidence([{ ...record, result: { decision: 'UNKNOWN' } }]), /decision/);
});
