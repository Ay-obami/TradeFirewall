/** Gas-free, deterministic adversarial test harness. No wallet or RPC dependencies. */
export interface Intent {
  id: string;
  account: string;
  market: string;
  requestedUsd: number;
  slippageBps: number;
  bypassRequested?: boolean;
}

export interface Snapshot {
  oracleAgeMs: number;
  dailyLossUsd: number;
}

export interface Step {
  /** Concurrent requests share a tick; locks reset at the next tick. */
  tick: number;
  intent: Intent;
  snapshot: Snapshot;
}

export type Action = 'allow' | 'resize' | 'block';
export interface Decision {
  action: Action;
  reason: string;
  approvedUsd?: number;
}

export type Gate = (step: Readonly<Step>) => Decision;

export interface Scenario {
  id: string;
  description: string;
  steps: Step[];
  expected: Array<Pick<Decision, 'action' | 'reason'>>;
}

export interface EventEvidence {
  tick: number;
  intentId: string;
  account: string;
  market: string;
  proposedUsd: number;
  decision: Decision;
  expected: Pick<Decision, 'action' | 'reason'> | null;
  matchesExpected: boolean;
  /** Intentionally absent: no live order is sent by this harness. */
  txHash: null;
}

export interface Metrics {
  proposed: number;
  allowed: number;
  resized: number;
  blocked: number;
  failedChecks: number;
}

export interface ScenarioEvidence {
  mode: 'OFFLINE_SIMULATION';
  scenarioId: string;
  description: string;
  passed: boolean;
  metrics: Metrics;
  events: EventEvidence[];
}

export interface SuiteEvidence {
  mode: 'OFFLINE_SIMULATION';
  passed: boolean;
  metrics: Metrics;
  results: ScenarioEvidence[];
}

const isValidStep = (step: Step): boolean =>
  Number.isSafeInteger(step.tick) && step.tick >= 0 &&
  !!step.intent.id && !!step.intent.account && !!step.intent.market &&
  Number.isFinite(step.intent.requestedUsd) && step.intent.requestedUsd > 0 &&
  Number.isFinite(step.intent.slippageBps) && step.intent.slippageBps >= 0 &&
  Number.isFinite(step.snapshot.oracleAgeMs) && step.snapshot.oracleAgeMs >= 0 &&
  Number.isFinite(step.snapshot.dailyLossUsd) && step.snapshot.dailyLossUsd >= 0;

const isValidDecision = (d: Decision, step: Step): boolean => {
  if (!d || !['allow', 'resize', 'block'].includes(d.action) || typeof d.reason !== 'string' || !d.reason) return false;
  if (d.action === 'block') return d.approvedUsd === undefined || d.approvedUsd === 0;
  return Number.isFinite(d.approvedUsd) && (d.approvedUsd ?? 0) > 0 &&
    (d.approvedUsd ?? 0) <= step.intent.requestedUsd &&
    (d.action !== 'resize' || (d.approvedUsd ?? 0) < step.intent.requestedUsd);
};

const emptyMetrics = (): Metrics => ({ proposed: 0, allowed: 0, resized: 0, blocked: 0, failedChecks: 0 });

function addMetrics(into: Metrics, other: Metrics): void {
  for (const key of Object.keys(into) as Array<keyof Metrics>) into[key] += other[key];
}

export function runScenario(scenario: Readonly<Scenario>, gate: Gate): ScenarioEvidence {
  const events: EventEvidence[] = [];
  const metrics = emptyMetrics();
  const usedIntentIds = new Set<string>();
  const reservedAccounts = new Set<string>();
  let priorTick = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < scenario.steps.length; index++) {
    const step = scenario.steps[index];
    metrics.proposed++;
    if (step.tick !== priorTick) reservedAccounts.clear();

    let decision: Decision;
    if (!isValidStep(step) || step.tick < priorTick) {
      decision = { action: 'block', reason: 'INVALID_STEP' };
    } else if (usedIntentIds.has(step.intent.id)) {
      decision = { action: 'block', reason: 'DUPLICATE_INTENT' };
    } else if (reservedAccounts.has(step.intent.account)) {
      decision = { action: 'block', reason: 'CONCURRENT_ACCOUNT_INTENT' };
    } else {
      try {
        const result = gate(step);
        decision = isValidDecision(result, step) ? result : { action: 'block', reason: 'INVALID_GATE_RESULT' };
      } catch {
        decision = { action: 'block', reason: 'GATE_EVALUATION_FAILED' };
      }
    }
    if (step.intent.id) usedIntentIds.add(step.intent.id);
    if (decision.action !== 'block') reservedAccounts.add(step.intent.account);
    priorTick = Math.max(priorTick, step.tick);

    metrics[decision.action === 'allow' ? 'allowed' : decision.action === 'resize' ? 'resized' : 'blocked']++;
    const expected = scenario.expected[index] ?? null;
    const matchesExpected = !!expected && expected.action === decision.action && expected.reason === decision.reason;
    if (!matchesExpected) metrics.failedChecks++;
    events.push({
      tick: step.tick,
      intentId: step.intent.id,
      account: step.intent.account,
      market: step.intent.market,
      proposedUsd: step.intent.requestedUsd,
      decision,
      expected,
      matchesExpected,
      txHash: null,
    });
  }
  if (scenario.expected.length > scenario.steps.length) metrics.failedChecks += scenario.expected.length - scenario.steps.length;
  return { mode: 'OFFLINE_SIMULATION', scenarioId: scenario.id, description: scenario.description, passed: metrics.failedChecks === 0, metrics, events };
}

export function runSuite(scenarios: ReadonlyArray<Scenario>, gate: Gate): SuiteEvidence {
  const results = scenarios.map(scenario => runScenario(scenario, gate));
  const metrics = emptyMetrics();
  for (const result of results) addMetrics(metrics, result.metrics);
  return { mode: 'OFFLINE_SIMULATION', passed: results.every(result => result.passed), metrics, results };
}

export function serializeEvidence(evidence: ScenarioEvidence | SuiteEvidence): string {
  return JSON.stringify(evidence, null, 2) + '\n';
}
