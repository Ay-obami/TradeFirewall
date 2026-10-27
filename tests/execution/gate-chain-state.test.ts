import assert from 'node:assert/strict';
import test from 'node:test';
import {createGateChainStateReader} from '../../src/execution/gate-chain-state.ts';

const owner='0x1111111111111111111111111111111111111111';
const bot='0x2222222222222222222222222222222222222222';
const gate='0x3333333333333333333333333333333333333333';
const pool='0x4444444444444444444444444444444444444444';
const hash='0x'+'a'.repeat(64);
const word=(x:bigint)=>x.toString(16).padStart(64,'0');
const addressWord=(x:string)=>x.slice(2).toLowerCase().padStart(64,'0');

function fixture(calls:Array<{method:string;params:unknown[]}>,options:{authorized?:boolean;wrongOwner?:boolean;missingGate?:boolean;reorg?:boolean}={}){
  let blocks=0;
  return async(method:string,params:unknown[])=>{
    calls.push({method,params});
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_blockNumber')return '0x64';
    if(method==='eth_getBlockByNumber'){
      blocks++;
      return {number:'0x64',hash:options.reorg&&blocks>1?'0x'+'b'.repeat(64):hash,timestamp:'0x12345'};
    }
    if(method==='eth_getCode')return options.missingGate&&String(params[0]).toLowerCase()===gate?'0x':'0x60006000';
    if(method==='eth_call'){
      const request=params[0] as {to:string;data:string};
      const selector=request.data.slice(0,10);
      if(selector==='0x10814c37')return '0x'+addressWord(bot);
      if(selector==='0x18101ea3')return '0x'+addressWord(options.wrongOwner?bot:owner);
      if(selector==='0x5c975abb')return '0x'+word(0n);
      if(selector==='0x8e8f294b')return '0x'+word(1n)+word(100n)+word(10n)+word(1000n);
      if(selector==='0x1ce56593')return '0x'+word(300n);
      if(selector==='0x72c06959')return '0x'+word(50n);
      if(selector==='0x25e44ffe')return '0x'+word(1n);
      if(selector==='0xa8cb3794')return '0x'+word(options.authorized===false?0n:1n);
    }
    throw new Error(`UNEXPECTED_${method}`);
  };
}

test('reads actual gate, allowance and narrow pool operator permission at one pinned block',async()=>{
  const calls:Array<{method:string;params:unknown[]}>=[];
  const reader=createGateChainStateReader({rpc:fixture(calls),gateAddress:gate,pool,owner,bot});
  const state=await reader.read();
  assert.equal(state.chainId,50383);
  assert.equal(state.contractDeployed,true);
  assert.equal(state.marketEnabled,true);
  assert.equal(state.operatorAuthorized,true);
  assert.equal(state.remainingGrossQuantityRaw,250n);
  assert.equal(state.marketLimits.maxQuantityRaw,100n);
  assert.equal(state.blockNumber,100n);
  assert.equal(state.riskExecutable,false);
  assert.equal(await reader.readNonce(7n),true);
  const ethCalls=calls.filter(c=>c.method==='eth_call');
  assert.ok(ethCalls.every(c=>c.params[1]==='0x64'));
  const auth=ethCalls.find(c=>(c.params[0] as any).data.startsWith('0xa8cb3794'))!;
  assert.equal((auth.params[0] as any).to.toLowerCase(),pool);
  assert.ok((auth.params[0] as any).data.endsWith('80054449'.padEnd(64,'0')));
});

test('wrong owner, absent gate or unauthorized pool cannot report an actionable gate',async()=>{
  for(const options of [{wrongOwner:true},{missingGate:true},{authorized:false}]){
    const calls:Array<{method:string;params:unknown[]}>=[];
    const reader=createGateChainStateReader({rpc:fixture(calls,options),gateAddress:gate,pool,owner,bot});
    const state=await reader.read();
    assert.ok(!state.contractDeployed||!state.operatorAuthorized||state.tradingOwner.toLowerCase()!==owner);
  }
});

test('network mismatch, malformed responses and a reorg fail closed',async()=>{
  await assert.rejects(createGateChainStateReader({rpc:async()=> '0x1',gateAddress:gate,pool,owner,bot}).read(),/WRONG_CHAIN/);
  await assert.rejects(createGateChainStateReader({rpc:fixture([],{reorg:true}),gateAddress:gate,pool,owner,bot}).read(),/REORG_DETECTED/);
  assert.throws(()=>createGateChainStateReader({rpc:fixture([]),gateAddress:'0xBAD',pool,owner,bot}),/INVALID_ADDRESS/);
  await assert.rejects(createGateChainStateReader({rpc:fixture([]),gateAddress:gate,pool,owner,bot}).readNonce(-1n),/INVALID_NONCE/);
});
