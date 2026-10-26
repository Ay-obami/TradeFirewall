import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectOperatorRegistry, inspectPerpPoolOperatorAuthorization } from '../../scripts/deploy/operator-permission.ts';

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

const pool='0x2a1822b02039ddf0e293f3f7243673fc03eaf16c';
const owner='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const operator='0x1234567890123456789012345678901234567890';

test('pool authorization checks Hideki and the real perps placeOrderFor selector',async()=>{
  const calls:Array<{method:string,params:unknown[]}>=[];
  const result=await inspectPerpPoolOperatorAuthorization({pool,owner,operator,rpc:async(method,params)=>{
    calls.push({method,params});
    return method==='eth_chainId'?'0xc4cf':method==='eth_getCode'?'0x6001':`0x${'0'.repeat(63)}1`;
  }});
  assert.equal(result.permission,'AUTHORIZED');
  assert.equal(result.readyForTrading,false);
  assert.deepEqual(calls.map(c=>c.method),['eth_chainId','eth_getCode','eth_call']);
  const calldata=(calls[2].params[0] as {data:string}).data;
  assert.equal(calldata.slice(0,10),'0xa8cb3794');
  assert.equal(calldata.length,2+8+3*64);
  assert.equal(calldata.slice(-64,-56),'80054449');
});

test('pool permission false, malformed result or missing code cannot enable trading',async()=>{
  const rpc=async(method:string)=>method==='eth_chainId'?'0xc4cf':method==='eth_getCode'?'0x6001':`0x${'0'.repeat(64)}`;
  const denied=await inspectPerpPoolOperatorAuthorization({pool,owner,operator,rpc});
  assert.equal(denied.permission,'NOT_AUTHORIZED');
  assert.equal(denied.readyForTrading,false);
  await assert.rejects(inspectPerpPoolOperatorAuthorization({pool,owner,operator,rpc:async(method)=>method==='eth_chainId'?'0xc4cf':method==='eth_getCode'?'0x6001':'0x2'}),/INVALID_PERMISSION_RESPONSE/);
  const wrong=await inspectPerpPoolOperatorAuthorization({pool,owner,operator,rpc:async()=> '0x1'});
  assert.equal(wrong.permission,'UNKNOWN_NOT_VERIFIED');
});
