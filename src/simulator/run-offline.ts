/**
 * Example-only runner. Its reference gate demonstrates reproducible adversarial
 * scenarios and is NOT the policy engine used for real order authorization.
 * Usage: node src/simulator/run-offline.ts fixtures/adversarial-scenarios.json
 */
import { readFileSync } from 'node:fs';
import { runSuite, serializeEvidence, type Gate, type Scenario } from './index.ts';

// Deliberately simple reference decisions that exercise the harness mechanics.
// The independently developed production policy will replace this evaluator.
export const referenceGate: Gate = ({ intent, snapshot }) => {
  if (snapshot.oracleAgeMs > 10_000) return { action: 'block', reason: 'STALE_ORACLE' };
  if (snapshot.dailyLossUsd > 500) return { action: 'block', reason: 'DAILY_LOSS' };
  if (intent.slippageBps > 80) return { action: 'block', reason: 'SLIPPAGE' };
  if (intent.bypassRequested) return { action: 'block', reason: 'UNAUTHORIZED_OVERRIDE' };
  if (intent.requestedUsd > 1_000) return { action: 'resize', approvedUsd: 1_000, reason: 'ORDER_NOTIONAL' };
  return { action: 'allow', approvedUsd: intent.requestedUsd, reason: 'POLICY_OK' };
};

if (process.argv[1]?.endsWith('run-offline.ts')) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Provide a fixture JSON path');
    const scenarios = JSON.parse(readFileSync(file, 'utf8')) as Scenario[];
    if (!Array.isArray(scenarios)) throw new Error('Fixture must be an array');
    const evidence = runSuite(scenarios, referenceGate);
    process.stdout.write(serializeEvidence(evidence));
    if (!evidence.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Offline scenario runner failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
