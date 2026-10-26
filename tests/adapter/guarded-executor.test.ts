import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuardedExecutor, type TradeIntent, type MarketSnapshot } from '../../src/adapter/guarded-executor.ts';

const intent: TradeIntent = {
  account: '0x1111111111111111111111111111111111111111',
  market: '0x2222222222222222222222222222222222222222',
  side: 'buy',
  orderType: 'limit',
  priceRaw: 100_000_000n,
  quantityRaw: 1_000_000n,
  clientOrderId: 'a-001',
};

const makeSnapshot = (): MarketSnapshot => ({
  chainId: 50383,
  account: intent.account,
  market: intent.market,
  blockNumber: 101n,
  observedAtMs: 1_000,
  markPriceRaw: 100_000_000n,
  availableMarginRaw: 1_000_000_000n,
  currentPositionRaw: 0n,
  snapshotId: 'block101-marketabc-account-v1',
});

function setup(options?: {
  approve?: boolean;
  decision?: 'allow' | 'resize' | 'block';
}) {
  let snapshot = makeSnapshot();
  let clock = 1_050;
  const calls: TradeIntent[] = [];
  const executor = createGuardedExecutor({
    readSnapshot: async () => snapshot,
    policy: async (proposed) =>
      options?.approve === false || options?.decision === 'block'
        ? { action: 'block' as const, reason: 'DAILY_LOSS_LIMIT' }
        : options?.decision === 'resize'
          ? { action: 'resize' as const, intent: { ...proposed, quantityRaw: 500_000n }, reason: 'POSITION_LIMIT' }
          : { action: 'allow' as const, intent: proposed, reason: 'WITHIN_LIMITS' },
    submitOrder: async (trade) => {
      calls.push(trade);
      return { transactionHash: '0x' + 'ab'.repeat(32) };
    },
    nowMs: () => clock,
    approvalTtlMs: 10_000,
    snapshotMaxAgeMs: 5_000,
  });
  return {
    executor,
    calls,
    setSnapshot: (next: MarketSnapshot) => { snapshot = next; },
    setClock: (next: number) => { clock = next; },
  };
}

test('blocked policy decision cannot create an executable approval', async () => {
  const { executor, calls } = setup({ approve: false });
  const outcome = await executor.prepare(intent);
  assert.deepEqual(outcome, { action: 'block', reason: 'DAILY_LOSS_LIMIT' });
  assert.equal(calls.length, 0);
});

test('allowed approval submits the exact approved intent once', async () => {
  const { executor, calls } = setup();
  const prepared = await executor.prepare(intent);
  assert.equal(prepared.action, 'approved');
  if (prepared.action !== 'approved') return;
  const result = await executor.execute(prepared.approvalId);
  assert.equal(result.transactionHash, '0x' + 'ab'.repeat(32));
  assert.deepEqual(calls, [intent]);
  await assert.rejects(executor.execute(prepared.approvalId), /INVALID_APPROVAL/);
});

test('resized policy decision submits only resized order', async () => {
  const { executor, calls } = setup({ decision: 'resize' });
  const prepared = await executor.prepare(intent);
  assert.equal(prepared.action, 'approved');
  if (prepared.action !== 'approved') return;
  assert.equal(prepared.intent.quantityRaw, 500_000n);
  await executor.execute(prepared.approvalId);
  assert.equal(calls[0].quantityRaw, 500_000n);
});

test('forged and expired approval ids never submit', async () => {
  const { executor, calls, setClock } = setup();
  await assert.rejects(executor.execute('forged'), /INVALID_APPROVAL/);
  const prepared = await executor.prepare(intent);
  assert.equal(prepared.action, 'approved');
  if (prepared.action !== 'approved') return;
  setClock(11_051);
  await assert.rejects(executor.execute(prepared.approvalId), /APPROVAL_EXPIRED/);
  assert.equal(calls.length, 0);
});

test('state drift invalidates approval, including position and margin changes', async () => {
  const { executor, calls, setSnapshot } = setup();
  const prepared = await executor.prepare(intent);
  assert.equal(prepared.action, 'approved');
  if (prepared.action !== 'approved') return;
  setSnapshot({ ...makeSnapshot(), availableMarginRaw: 900_000_000n });
  await assert.rejects(executor.execute(prepared.approvalId), /STATE_DRIFT/);
  assert.equal(calls.length, 0);
});

test('wrong chain, mismatched market and stale source data fail closed', async () => {
  const { executor, calls, setSnapshot, setClock } = setup();
  setSnapshot({ ...makeSnapshot(), chainId: 50312 });
  await assert.rejects(executor.prepare(intent), /WRONG_CHAIN/);
  setSnapshot({ ...makeSnapshot(), market: '0x3333333333333333333333333333333333333333' });
  await assert.rejects(executor.prepare(intent), /SNAPSHOT_MISMATCH/);
  setSnapshot(makeSnapshot());
  setClock(9_000);
  await assert.rejects(executor.prepare(intent), /STALE_SNAPSHOT/);
  assert.equal(calls.length, 0);
});

test('duplicate account approval cannot race against first pending trade', async () => {
  const { executor, calls } = setup();
  const prepared = await executor.prepare(intent);
  assert.equal(prepared.action, 'approved');
  await assert.rejects(executor.prepare({ ...intent, clientOrderId: 'a-002' }), /ACCOUNT_BUSY/);
  if (prepared.action !== 'approved') return;
  await executor.execute(prepared.approvalId);
  const second = await executor.prepare({ ...intent, clientOrderId: 'a-003' });
  assert.equal(second.action, 'approved');
  assert.equal(calls.length, 1);
});

test('explicit dry run never sends transactions', async () => {
  const { executor, calls } = setup();
  const prepared = await executor.prepare(intent);
  if (prepared.action !== 'approved') throw Error('expected approval');
  const result = await executor.dryRun(prepared.approvalId);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.intent.clientOrderId, 'a-001');
  assert.equal(calls.length, 0);
  await assert.rejects(executor.execute(prepared.approvalId), /INVALID_APPROVAL/);
});

test('a concurrent preparation remains locked while prior transaction submission is in flight', async () => {
  let completeSubmission!: (value: { transactionHash: `0x${string}` }) => void;
  const pending = new Promise<{ transactionHash: `0x${string}` }>((resolve) => { completeSubmission = resolve; });
  const executor = createGuardedExecutor({
    readSnapshot: async () => makeSnapshot(),
    policy: async (trade) => ({ action: 'allow', reason: 'OK', intent: trade }),
    submitOrder: async () => pending,
    nowMs: () => 1_050,
  });
  const approved = await executor.prepare(intent);
  if (approved.action !== 'approved') throw Error('expected approval');
  const executing = executor.execute(approved.approvalId);
  await assert.rejects(executor.prepare({ ...intent, clientOrderId: 'parallel' }), /ACCOUNT_BUSY/);
  completeSubmission({ transactionHash: '0x' + 'cd'.repeat(32) as `0x${string}` });
  await executing;
  assert.equal((await executor.prepare({ ...intent, clientOrderId: 'next' })).action, 'approved');
});

test('expired pending approval releases account reservation for fresh preparation', async () => {
  const { executor, setClock, setSnapshot } = setup();
  const approved = await executor.prepare(intent);
  if (approved.action !== 'approved') throw Error('expected approval');
  setClock(11_051);
  setSnapshot({ ...makeSnapshot(), observedAtMs: 11_050, snapshotId: 'block101-new' });
  const second = await executor.prepare({ ...intent, clientOrderId: 'fresh' });
  assert.equal(second.action, 'approved');
  await assert.rejects(executor.execute(approved.approvalId), /INVALID_APPROVAL/);
});

test('policy cannot replace destination market, side or enlarge order size', async () => {
  const changed = [
    { ...intent, market: '0x3333333333333333333333333333333333333333' as `0x${string}` },
    { ...intent, side: 'sell' as const },
    { ...intent, quantityRaw: 1_000_001n },
  ];
  for (const malicious of changed) {
    let submitted = false;
    const executor = createGuardedExecutor({
      readSnapshot: async () => makeSnapshot(),
      policy: () => ({ action: 'resize', intent: malicious, reason: 'WRONG' }),
      submitOrder: async () => { submitted = true; return { transactionHash: '0x' + 'cd'.repeat(32) as `0x${string}` }; },
      nowMs: () => 1_050,
    });
    await assert.rejects(executor.prepare(intent), /UNSAFE_POLICY_MUTATION/);
    assert.equal(submitted, false);
  }
});

test('RPC read failure rejects approval and releases account for retry', async () => {
  let failed = true;
  const executor = createGuardedExecutor({
    readSnapshot: async () => {
      if (failed) throw new Error('RPC_UNAVAILABLE');
      return makeSnapshot();
    },
    policy: (proposed) => ({ action: 'allow', intent: proposed, reason: 'OK' }),
    submitOrder: async () => ({ transactionHash: '0x' + 'cd'.repeat(32) as `0x${string}` }),
    nowMs: () => 1_050,
  });
  await assert.rejects(executor.prepare(intent), /RPC_UNAVAILABLE/);
  failed = false;
  assert.equal((await executor.prepare(intent)).action, 'approved');
});
