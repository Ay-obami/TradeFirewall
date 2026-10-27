import assert from 'node:assert/strict';
import test from 'node:test';
import {createHidekiRiskSources} from '../../src/integration/hideki-risk-sources.ts';

const account='0x'+'a'.repeat(40),market='0x'+'b'.repeat(40),gate='0x'+'c'.repeat(40),bot='0x'+'d'.repeat(40);
const hash='0x'+'e'.repeat(64), selector='80054449';
const expectedGateRuntimeCode='0x6001',expectedPoolRuntimeCode='0x6002';
const config={gateAddress:gate,botAddress:bot,expectedGateRuntimeCode,expectedPoolRuntimeCode};
const w=(n:bigint)=>n.toString(16).padStart(64,'0');
const addr=(a:string)=>a.slice(2).padStart(64,'0');
const scope={chainId:50383,account,market,gateAddress:gate,blockNumber:12n,blockHash:hash,observedAtMs:1000,
  markPriceRaw:100n,snapshotId:`12:${hash}`};

function fixture(options:{reorg?:boolean;badBool?:boolean;directBot?:boolean;missingCode?:boolean;swappedCode?:boolean}={}){
  const calls:{method:string;params:unknown[]}[]=[];
  let blocks=0;
  const rpc=async(method:string,params:unknown[]):Promise<unknown>=>{
    calls.push({method,params});
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_getBlockByNumber')return {number:'0xc',hash:options.reorg&&++blocks>1?'0x'+'f'.repeat(64):hash,timestamp:'0x1'};
    if(method==='eth_getCode')return options.missingCode?'0x':options.swappedCode?'0x6003':params[0]===gate?'0x6001':'0x6002';
    if(method==='eth_call'){
      assert.deepEqual(params[1],{blockHash:hash,requireCanonical:true});
      const data=(params[0] as {data:string}).data.toLowerCase();
      if(data==='0x10814c37')return '0x'+addr(bot);
      if(data==='0x18101ea3')return '0x'+addr(account);
      if(data==='0x5c975abb')return '0x'+w(options.badBool?2n:0n);
      if(data.startsWith('0x8e8f294b'))return '0x'+w(1n)+w(100n)+w(1n)+w(1000n);
      if(data.startsWith('0xa8cb3794'))return '0x'+w(data.includes(addr(bot))&&options.directBot?1n:data.includes(addr(gate))?1n:0n);
      throw Error('UNEXPECTED_CALL');
    }
    throw Error(`UNEXPECTED_RPC_${method}`);
  };
  return {rpc,calls};
}

test('reads canonical Hideki block and verifies timestamp and identity',async()=>{
  const {rpc}=fixture();const sources=createHidekiRiskSources({rpc,...config,nowMs:()=>1100});
  assert.deepEqual(await sources.readBlock(12n),{chainId:50383,number:12n,hash,timestampMs:1000});
  await assert.rejects(sources.readBlock(-1n),/INVALID_BLOCK/);
});

test('gate reads are EIP-1898 block-hash pinned and require owner, enabled market and exclusive gate operator',async()=>{
  const {rpc,calls}=fixture();const sources=createHidekiRiskSources({rpc,...config,nowMs:()=>1100});
  assert.deepEqual(await sources.readGate(scope),{chainId:50383,account,market,gateAddress:gate,
    blockNumber:12n,blockHash:hash,contractDeployed:true,paused:false,marketEnabled:true,operatorAuthorized:true});
  assert.equal(calls.some(c=>c.method==='eth_call'&&(c.params[1] as any)?.blockHash!==hash),false);
});

test('gate and block reads fail closed on reorg, malformed bool, missing contracts and direct bot bypass',async()=>{
  for(const variant of [{reorg:true},{badBool:true},{missingCode:true},{directBot:true},{swappedCode:true}]){
    const {rpc}=fixture(variant);
    const sources=createHidekiRiskSources({rpc,...config,nowMs:()=>1100});
    await assert.rejects(sources.readGate(scope));
  }
});

test('rejects scope mismatch and stale samples before returning gate state',async()=>{
  const {rpc}=fixture();const sources=createHidekiRiskSources({rpc,...config,nowMs:()=>5001,maxAgeMs:3000});
  await assert.rejects(sources.readGate(scope),/STALE_RISK_SCOPE/);
  await assert.rejects(sources.readGate({...scope,chainId:1}),/INVALID_RISK_SCOPE/);
  const fresh=createHidekiRiskSources({rpc,...config,nowMs:()=>1100});
  const wrongHash='0x'+'0'.repeat(64);
  await assert.rejects(fresh.readGate({...scope,blockHash:wrongHash,snapshotId:`12:${wrongHash}`}),/BLOCK_HASH_MISMATCH/);
});

test('unverified mark, policy and daily USD loss cannot become executable evidence',async()=>{
  const {rpc}=fixture();const sources=createHidekiRiskSources({rpc,...config,nowMs:()=>1100});
  await assert.rejects(sources.readPrice(scope),/UNVERIFIED_HIDEKI_MARK_ABI/);
  await assert.rejects(sources.readPolicy(scope),/UNVERIFIED_RISK_POLICY_SOURCE/);
  await assert.rejects(sources.readDailyLoss(scope),/UNVERIFIED_DAILY_USD_LOSS_SOURCE/);
});

test('rejects absent, empty, malformed or non-attested runtime code before reading gate state',async()=>{
  const {rpc}=fixture();
  for(const bad of [
    {expectedGateRuntimeCode:undefined,expectedPoolRuntimeCode},
    {expectedGateRuntimeCode,expectedPoolRuntimeCode:undefined},
    {expectedGateRuntimeCode:'0x',expectedPoolRuntimeCode},
    {expectedGateRuntimeCode:'0x0',expectedPoolRuntimeCode},
    {expectedGateRuntimeCode,expectedPoolRuntimeCode:'0x0000'},
  ]){
    assert.throws(()=>createHidekiRiskSources({rpc,gateAddress:gate,botAddress:bot,...bad}),/INVALID_ATTESTED_RUNTIME_CODE/);
  }
  const source=createHidekiRiskSources({rpc,...config,expectedPoolRuntimeCode:'0x6003',nowMs:()=>1100});
  await assert.rejects(source.readGate(scope),/POOL_RUNTIME_CODE_MISMATCH/);
  const wrongGate=createHidekiRiskSources({rpc,...config,expectedGateRuntimeCode:'0x6003',nowMs:()=>1100});
  await assert.rejects(wrongGate.readGate(scope),/GATE_RUNTIME_CODE_MISMATCH/);
});
