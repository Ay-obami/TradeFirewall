import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareUnsignedExecutionBundle, inspectUnsignedBundleGasAndNonces} from '../../src/deploy/unsigned-execution-bundle.ts';

const admin='0x1111111111111111111111111111111111111111';
const bot='0x2222222222222222222222222222222222222222';
const owner='0x3333333333333333333333333333333333333333';
const pool='0x4444444444444444444444444444444444444444';
const gate='0x5555555555555555555555555555555555555555';
const registry='0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a';
const w=(n:bigint)=>n.toString(16).padStart(64,'0');
const a=(s:string)=>s.slice(2).toLowerCase().padStart(64,'0');
const input={chainId:50383,creationBytecode:'0x60016000',deployer:admin,administrator:admin,bot,tradingOwner:owner,
  gateAddress:gate,pool,registry,maxQuantityRaw:100n,minPriceRaw:1000n,maxPriceRaw:2000n,
  grossQuantityRaw:200n,nowSec:1000n,order:{pool,isBid:true,userData:1n,price:1500n,quantity:50n,
    expireTimestampNs:1_100_000_000_000n,orderType:0,selfMatchingOption:0,
    builder:'0x0000000000000000000000000000000000000000',builderFeeBpsTimes1k:0n,nonce:7n,deadline:1050n}} as const;

test('encodes five unsignable transactions with exact role/target/selector isolation',()=>{
  const bundle=prepareUnsignedExecutionBundle(input);
  assert.equal(bundle.readyToBroadcast,false);
  assert.deepEqual(bundle.transactions.map(t=>t.stage),['deploy','configure','gross-limit','grant-gate-only','submit']);
  assert.deepEqual(bundle.transactions.map(t=>t.from),[admin,admin,admin,owner,bot]);
  assert.deepEqual(bundle.transactions.map(t=>t.to),[null,gate,gate,registry,gate]);
  assert.equal(bundle.transactions[0].data,`0x60016000${a(admin)}${a(bot)}${a(owner)}`);
  assert.equal(bundle.transactions[1].data,`0x6983d62b${a(pool)}${w(100n)}${w(1000n)}${w(2000n)}${w(1n)}`);
  assert.equal(bundle.transactions[2].data,`0x75c4bb62${a(pool)}${w(200n)}`);
  assert.equal(bundle.transactions[3].data,`0x7bbc67e6${a(pool)}${a(gate)}${w(128n)}${w(1n)}${w(1n)}${'80054449'.padEnd(64,'0')}`);
  assert.equal(bundle.transactions[4].data.slice(0,10),'0xa99b37c0');
  assert.ok(bundle.transactions.every(t=>t.value==='0x0'&&t.gas===null&&t.nonce===null));
  assert.ok(bundle.hardStops.includes('VERIFY_DEPLOYED_GATE_ADDRESS_AND_RUNTIME'));
});

test('rejects wrong chain, bot bypass identities, dangerous grant targets and stale order deadlines',()=>{
  for(const patch of [
    {chainId:1},{gateAddress:bot},{registry:bot},{deployer:bot},{administrator:bot},
    {tradingOwner:bot},{pool:gate},{grossQuantityRaw:0n},{maxPriceRaw:999n},
    {order:{...input.order,pool:gate}},
    {order:{...input.order,deadline:1000n}},
    {order:{...input.order,expireTimestampNs:999_000_000_000n}},
    {order:{...input.order,quantity:300n}},
  ]) assert.throws(()=>prepareUnsignedExecutionBundle({...input,...patch} as any));
});

test('cannot redirect owner permission grant to an arbitrary registry address',()=>{
  assert.throws(()=>prepareUnsignedExecutionBundle({...input,
    registry:'0x6666666666666666666666666666666666666666'}),/UNVERIFIED_OPERATOR_REGISTRY/);
  const lower=prepareUnsignedExecutionBundle({...input,registry:registry.toLowerCase()});
  assert.equal(lower.transactions[3].to,registry);
});

test('read-only gas/nonce inspection checks chain and bot direct permission without transmitting',async()=>{
  const bundle=prepareUnsignedExecutionBundle(input);
  const calls:{method:string;params:unknown[]}[]=[];
  const rpc=async(method:string,params:unknown[])=>{
    calls.push({method,params});
    if(method==='eth_chainId')return '0xc4cf'; // 50383
    if(method==='eth_getTransactionCount')return '0x9';
    if(method==='eth_estimateGas')return '0x5208';
    if(method==='eth_call')return `0x${w(0n)}`;
    throw Error(`UNEXPECTED_${method}`);
  };
  const inspected=await inspectUnsignedBundleGasAndNonces(bundle,rpc);
  assert.equal(inspected.readyToBroadcast,false);
  assert.equal(inspected.botDirectOperatorAuthorized,false);
  assert.deepEqual(inspected.transactions.map(t=>t.nonce),[9n,10n,11n,9n,9n]);
  assert.ok(inspected.transactions.every(t=>t.gas===21000n));
  assert.ok(calls.every(c=>!c.method.startsWith('eth_send')&&!c.method.includes('sign')));
  const permissionCall=calls.find(c=>c.method==='eth_call')!;
  assert.equal((permissionCall.params[0] as any).to,pool);
  assert.equal((permissionCall.params[0] as any).data,`0xa8cb3794${a(owner)}${a(bot)}${'80054449'.padEnd(64,'0')}`);
});

test('read-only inspection fails closed on wrong chain, bot permission or unknown gas',async()=>{
  const bundle=prepareUnsignedExecutionBundle(input);
  await assert.rejects(inspectUnsignedBundleGasAndNonces(bundle,async()=> '0x1'),/WRONG_CHAIN/);
  const rpc=async(method:string)=>method==='eth_chainId'?'0xc4cf':method==='eth_call'?`0x${w(1n)}`:'0x1';
  await assert.rejects(inspectUnsignedBundleGasAndNonces(bundle,rpc),/DIRECT_BOT_OPERATOR_BYPASS/);
  const failed=await inspectUnsignedBundleGasAndNonces(bundle,async(method:string)=>
    method==='eth_chainId'?'0xc4cf':method==='eth_call'?`0x${w(0n)}`:method==='eth_getTransactionCount'?'0x0':Promise.reject(Error('estimate unavailable')));
  assert.ok(failed.transactions.every(t=>t.gas===null));
  assert.ok(failed.hardStops.includes('GAS_ESTIMATE_UNAVAILABLE'));
});
