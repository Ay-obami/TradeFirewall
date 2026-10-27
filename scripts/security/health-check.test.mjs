import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRpcHealth, createHealthRpc } from './health-check.mjs';

const head = { number: '0x20', hash: `0x${'ab'.repeat(32)}`, timestamp: '0x64' };
const good = async method => method === 'eth_chainId' ? '0xc4cf' : method === 'eth_blockNumber' ? '0x20' : head;

test('only read methods, canonical block and fresh timestamp produce healthy diagnostic', async () => {
  const result = await assessRpcHealth(good, { nowSec: 110, maxAgeSec: 30 });
  assert.equal(result.healthy, true);
  assert.equal(result.chainId, 50383);
  assert.equal(result.blockNumber, '32');
  assert.equal(result.readyForTrading, false);
  assert.ok(!JSON.stringify(result).includes('https://'));
});

test('wrong chain, stale block, malformed head and RPC error fail closed', async () => {
  for (const rpc of [
    async method => method === 'eth_chainId' ? '0x1' : good(method),
    good,
    async method => method === 'eth_getBlockByNumber' ? { ...head, hash: '0x0' } : good(method),
    async () => { throw Error('private RPC URL https://secret.example/key'); },
  ]) {
    const result = await assessRpcHealth(rpc, { nowSec: rpc === good ? 200 : 110, maxAgeSec: 30 });
    assert.equal(result.healthy, false);
    assert.equal(result.readyForTrading, false);
    assert.ok(!JSON.stringify(result).includes('secret.example'));
  }
});

test('RPC transport rejects unapproved methods before invoking fetch', async () => {
  let called = false;
  const rpc = createHealthRpc('https://example.invalid/rpc', async () => { called = true; throw Error('unused'); });
  await assert.rejects(rpc('eth_sendRawTransaction', ['0xdead']), /READ_ONLY_METHOD_ONLY/);
  assert.equal(called, false);
  assert.throws(() => createHealthRpc('http://example.invalid'), /HTTPS_REQUIRED/);
  assert.throws(() => createHealthRpc('https://example.invalid/?apiKey=secret'), /HTTPS_REQUIRED/);
});
