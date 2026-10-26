import test from 'node:test';
import assert from 'node:assert/strict';
import {collectMarginBankLogs} from '../../src/account-state/margin-bank-log-collector.ts';

const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const hash='0x'+'a'.repeat(64);
const log=(block:number,idx:number)=>({address:bank,blockNumber:`0x${block.toString(16)}`,blockHash:hash,
  transactionHash:'0x'+'b'.repeat(64),logIndex:`0x${idx.toString(16)}`,topics:['0x'+'c'.repeat(64)],data:'0x',removed:false});
const makeRpc=(requests:Array<{method:string;params:unknown[]}>,override?:(m:string,p:unknown[])=>unknown)=>async(method:string,params:unknown[])=>{
  requests.push({method,params});
  const v=override?.(method,params);
  if(v!==undefined)return v;
  if(method==='eth_chainId')return '0xc4cf';
  if(method==='eth_getBlockByNumber')return {number:(params[0] as string),hash,timestamp:'0x123'};
  if(method==='eth_getLogs')return [log(Number(BigInt((params[0] as any).fromBlock)),0)];
  throw Error(`unexpected ${method}`);
};

test('collects every bank log from contiguous capped ranges without hiding unrecognized topics',async()=>{
  const requests:Array<{method:string;params:unknown[]}>=[];
  const result=await collectMarginBankLogs({rpc:makeRpc(requests),fromExclusive:10n,toInclusive:16n,chunkSize:2n});
  assert.deepEqual(result.logs.map(x=>x.blockNumber),[11n,13n,15n]);
  assert.equal(result.coverage.complete,true);
  assert.equal(result.coverage.source,'VERIFIED_CHAIN_LOGS');
  assert.equal(result.riskExecutable,false);
  const queries=requests.filter(x=>x.method==='eth_getLogs').map(x=>x.params[0] as any);
  assert.deepEqual(queries.map(x=>[x.fromBlock,x.toBlock]),[['0xb','0xc'],['0xd','0xe'],['0xf','0x10']]);
  assert.ok(queries.every(x=>x.address===bank&&!('topics' in x)));
});

test('refuses incomplete ranges, responses from different addresses, and dropped log identity',async()=>{
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([]),fromExclusive:10n,toInclusive:10n}),/INVALID_RANGE/);
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([],m=>m==='eth_chainId'?'0x1':undefined),fromExclusive:10n,toInclusive:12n}),/WRONG_CHAIN/);
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([],m=>m==='eth_getLogs'?[{...log(11,0),address:'0x'+'1'.repeat(40)}]:undefined),fromExclusive:10n,toInclusive:12n}),/UNEXPECTED_LOG_ADDRESS/);
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([],m=>m==='eth_getLogs'?[{...log(11,0),blockHash:null}]:undefined),fromExclusive:10n,toInclusive:12n}),/MALFORMED_LOG/);
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([],m=>m==='eth_getLogs'?[log(99,0)]:undefined),fromExclusive:10n,toInclusive:12n}),/LOG_OUTSIDE_RANGE/);
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([],m=>m==='eth_getLogs'?null:undefined),fromExclusive:10n,toInclusive:12n}),/INCOMPLETE_LOG_COVERAGE/);
});

test('refuses duplicate chain logs and any endpoint reorg',async()=>{
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([],m=>m==='eth_getLogs'?[log(11,0),log(11,0)]:undefined),fromExclusive:10n,toInclusive:12n}),/DUPLICATE_LOG/);
  let blockReads=0;
  await assert.rejects(collectMarginBankLogs({rpc:makeRpc([],m=>{
    if(m==='eth_getBlockByNumber'){blockReads++;return {number:blockReads%2?'0xa':'0xc',hash:blockReads>2?'0x'+'d'.repeat(64):hash,timestamp:'0x123'};}
    if(m==='eth_getLogs')return [];
  }),fromExclusive:10n,toInclusive:12n}),/REORG_DETECTED|INVALID_BLOCK_RESPONSE/);
});
