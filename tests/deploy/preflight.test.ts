import assert from 'node:assert/strict';
import test from 'node:test';
import { runDeploymentPreflight } from '../../scripts/deploy/preflight.ts';

const wallet = '0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const pool = '0x2a1822b02039ddf0e293f3f7243673fc03eaf16c';
const registry = '0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a';

function rpcMock(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const data: Record<string, unknown> = {
    eth_chainId: '0xc4cf',
    [`eth_getBalance:${wallet.toLowerCase()}`]: '0x2386f26fc10000',
    [`eth_getCode:${pool.toLowerCase()}`]: '0x60016000',
    [`eth_getCode:${registry.toLowerCase()}`]: '0x60026000',
    ...overrides,
  };
  return {
    calls,
    request: async (method: string, params: string[]) => {
      calls.push(method);
      return data[`${method}:${params[0]?.toLowerCase()}`] ?? data[method] ?? '0x';
    },
  };
}

test('read-only preflight accepts correct chain, funded wallet and deployed protocol contracts', async () => {
  const rpc = rpcMock();
  const result = await runDeploymentPreflight({ rpc:rpc.request, wallet, pool, registry });
  assert.equal(result.readyForDeployment, true);
  assert.equal(result.readyForTrading, false);
  assert.equal(result.chainId, 50383);
  assert.equal(result.balanceWei, 10_000_000_000_000_000n);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.pending.includes('operator approval not verified'), true);
  assert.deepEqual(rpc.calls.sort(), ['eth_chainId','eth_getBalance','eth_getCode','eth_getCode'].sort());
});

test('wrong chain blocks before querying contracts', async () => {
  const rpc = rpcMock({eth_chainId:'0x1'});
  const result = await runDeploymentPreflight({ rpc:rpc.request,wallet,pool,registry });
  assert.equal(result.readyForDeployment,false);
  assert.equal(result.blockers.includes('wrong network: expected 50383'),true);
  assert.deepEqual(rpc.calls,['eth_chainId']);
});

test('zero balance, missing pool and registry bytecode cannot be marked deploy-ready', async () => {
  const rpc = rpcMock({
    [`eth_getBalance:${wallet.toLowerCase()}`]:'0x0',
    [`eth_getCode:${pool.toLowerCase()}`]:'0x',
    [`eth_getCode:${registry.toLowerCase()}`]:'0x00',
  });
  const result = await runDeploymentPreflight({rpc:rpc.request,wallet,pool,registry});
  assert.equal(result.readyForDeployment,false);
  assert.match(result.blockers.join(' | '),/wallet has no gas/);
  assert.match(result.blockers.join(' | '),/pool has no bytecode/);
  assert.match(result.blockers.join(' | '),/registry has no bytecode/);
});

test('rejects malformed input and malformed RPC answers without sending any transaction', async () => {
  const rpc = rpcMock({eth_chainId:'invalid'});
  await assert.rejects(runDeploymentPreflight({rpc:rpc.request,wallet,pool,registry}),/invalid RPC chain ID/);
  await assert.rejects(runDeploymentPreflight({rpc:rpc.request,wallet:'0x123',pool,registry}),/invalid wallet address/);
  assert.equal(rpc.calls.every(x => ['eth_chainId','eth_getBalance','eth_getCode'].includes(x)),true);
});
