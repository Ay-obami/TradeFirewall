import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectOperatorRegistry } from '../../scripts/deploy/operator-permission.ts';

const registry = '0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a';

test('registry bytecode on Hideki is not sufficient proof of operator authorization', async () => {
  const calls: string[] = [];
  const result = await inspectOperatorRegistry({registry, rpc:async(method) => {
    calls.push(method);
    return method === 'eth_chainId' ? '0xc4cf' : '0x60016000';
  }});
  assert.equal(result.chainId,50383);
  assert.equal(result.registryHasCode,true);
  assert.equal(result.operatorAuthorization,'UNKNOWN_NOT_VERIFIED');
  assert.equal(result.readyForTrading,false);
  assert.deepEqual(calls,['eth_chainId','eth_getCode']);
});

test('wrong-chain or absent bytecode never implies permission', async () => {
  const wrong = await inspectOperatorRegistry({registry,rpc:async(method)=>method==='eth_chainId'?'0x1':'0x6000'});
  assert.equal(wrong.operatorAuthorization,'UNKNOWN_NOT_VERIFIED');
  assert.equal(wrong.registryHasCode,false);
  const absent = await inspectOperatorRegistry({registry,rpc:async(method)=>method==='eth_chainId'?'0xc4cf':'0x'});
  assert.equal(absent.registryHasCode,false);
  assert.equal(absent.readyForTrading,false);
});

test('malformed addresses, chain IDs and code fail closed', async () => {
  await assert.rejects(inspectOperatorRegistry({registry:'0x123',rpc:async()=> '0xc4cf'}),/registry address/);
  await assert.rejects(inspectOperatorRegistry({registry,rpc:async()=> 'garbage'}),/chain ID/);
  await assert.rejects(inspectOperatorRegistry({registry,rpc:async(method)=>method==='eth_chainId'?'0xc4cf':'garbage'}),/registry code/);
});
