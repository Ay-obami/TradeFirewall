import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoherentAccountReaders } from '../../src/account-state/coherent-reads.ts';

const account = '0x1111111111111111111111111111111111111111' as const;
const pool = '0x2222222222222222222222222222222222222222' as const;
const blockHash = `0x${'a'.repeat(64)}` as const;
const head = { chainId:50383, number:900n, hash:blockHash, timestampMs:120_000 };

function deps(overrides: Record<string, unknown> = {}) {
  const visited: bigint[] = [];
  const reads = {
    readHead: async () => head,
    readBlock: async (block: bigint) => ({ ...head, number:block }),
    readAccount: async (_a: string, _p: string, block: bigint) => {
      visited.push(block);
      return { availableMarginRaw:400n, currentPositionRaw:-2n, markPriceRaw:100n, equityUsd6:'100000000', dailyPnlUsd6:'-5000000' };
    },
    nowMs: () => 120_100,
    ...overrides,
  };
  return { reader:createCoherentAccountReaders(reads as any), visited };
}

test('produces a coherent on-chain snapshot and performance pinned to the same block', async () => {
  const { reader, visited } = deps();
  const snapshot = await reader.readAccountSnapshot(account,pool);
  const perf = await reader.readPerformance(account,pool,snapshot.blockNumber);
  assert.equal(snapshot.blockNumber,900n);
  assert.equal(snapshot.currentPositionRaw,-2n);
  assert.equal(snapshot.markPriceRaw,100n);
  assert.equal(snapshot.snapshotId,`${900}:${blockHash}`);
  assert.deepEqual(perf,{ equityUsd6:'100000000',dailyPnlUsd6:'-5000000' });
  assert.deepEqual(visited,[900n]);
});

test('refuses wrong-chain heads, stale heads and malformed prices', async () => {
  for (const altered of [
    { readHead:async()=>({...head,chainId:1}) },
    { nowMs:()=>125_000 },
    { readAccount:async()=>({availableMarginRaw:1n,currentPositionRaw:0n,markPriceRaw:0n,equityUsd6:'1',dailyPnlUsd6:'0'}) },
  ]) {
    const {reader}=deps(altered);
    await assert.rejects(reader.readAccountSnapshot(account,pool));
  }
});

test('refuses account, block and performance drift rather than recomputing risk from another block', async () => {
  const {reader}=deps();
  const snapshot=await reader.readAccountSnapshot(account,pool);
  await assert.rejects(reader.readPerformance(account,pool,901n),/UNVERIFIED_BLOCK/);
  await assert.rejects(reader.readPerformance('0x3333333333333333333333333333333333333333',pool,snapshot.blockNumber),/UNVERIFIED_BLOCK/);
  let reorged=false;
  const changed=deps({readBlock:async()=>({...head,hash:reorged?`0x${'b'.repeat(64)}`:blockHash})});
  const s=await changed.reader.readAccountSnapshot(account,pool);
  reorged=true;
  await assert.rejects(changed.reader.readPerformance(account,pool,s.blockNumber),/REORG_DETECTED/);
});

test('rejects non-finite and invented performance or decimal values', async () => {
  for (const data of [
    {equityUsd6:'100.2',dailyPnlUsd6:'0'},
    {equityUsd6:'0',dailyPnlUsd6:'0'},
    {equityUsd6:'100',dailyPnlUsd6:'NaN'},
    {equityUsd6:'100',dailyPnlUsd6:'-0'},
  ]) {
    const {reader}=deps({readAccount:async()=>({availableMarginRaw:1n,currentPositionRaw:0n,markPriceRaw:1n,...data})});
    await assert.rejects(reader.readAccountSnapshot(account,pool),/INVALID_PERFORMANCE/);
  }
});
