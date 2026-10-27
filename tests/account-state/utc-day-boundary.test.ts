import test from 'node:test';
import assert from 'node:assert/strict';
import {findUtcDayStartBlock} from '../../src/account-state/utc-day-boundary.ts';

const hash=n=>'0x'+n.toString(16).padStart(64,'0');
const times=[86200n,86300n,86399n,86400n,86400n,86401n,86500n,87000n];
const makeRpc=(timestamps:bigint[],change?:(n:number)=>unknown)=>async(method:string,params:unknown[])=>{
  if(method==='eth_chainId')return '0xc4cf';
  if(method!=='eth_getBlockByNumber')throw Error('unexpected');
  const n=Number(BigInt(params[0] as string));
  const override=change?.(n);
  if(override!==undefined)return override;
  return {number:`0x${n.toString(16)}`,hash:hash(n),timestamp:`0x${timestamps[n].toString(16)}`};
};

test('finds last block strictly before 00:00 UTC, including duplicate-midnight timestamps',async()=>{
  const result=await findUtcDayStartBlock({rpc:makeRpc(times),asOfBlock:7n});
  assert.equal(result.utcDayStartSec,86400n);
  assert.equal(result.baselineBlockNumber,2n);
  assert.equal(result.nextBlockNumber,3n);
  assert.equal(result.baselineTimestampSec,86399n);
  assert.equal(result.nextTimestampSec,86400n);
  assert.equal(result.riskExecutable,false);
});

test('refuses wrong-chain reads and day with no prior boundary block',async()=>{
  await assert.rejects(findUtcDayStartBlock({rpc:async()=> '0x1',asOfBlock:7n}),/WRONG_CHAIN/);
  await assert.rejects(findUtcDayStartBlock({rpc:makeRpc([86400n,86410n]),asOfBlock:1n}),/NO_PRE_DAY_BLOCK/);
  await assert.rejects(findUtcDayStartBlock({rpc:makeRpc(times),asOfBlock:-1n}),/INVALID_BLOCK/);
});

test('refuses invalid timestamp encoding or changed boundary block identity',async()=>{
  let reads=0;
  await assert.rejects(findUtcDayStartBlock({rpc:makeRpc(times,n=>{
    if(n===2){reads++;if(reads>2)return {number:'0x2',hash:hash(99),timestamp:'0x1517f'};}
  }),asOfBlock:7n}),/REORG_DETECTED/);
  await assert.rejects(findUtcDayStartBlock({rpc:makeRpc(times,n=>n===3?{number:'0x3',hash:hash(3),timestamp:'0xZZ'}:undefined),asOfBlock:7n}),/INVALID_BLOCK_RESPONSE/);
});
