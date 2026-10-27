import test from 'node:test';
import assert from 'node:assert/strict';
import {createTotalEconomicEquityReader} from '../../src/account-state/total-economic-equity.ts';

const account='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const hash='0x'+'a'.repeat(64);
const block={number:'0x64',hash,timestamp:'0x5f5e100'};
const rpc=async(method:string,params:unknown[])=>method==='eth_chainId'?'0xc4cf':method==='eth_getBlockByNumber'?block:undefined;

test('combines unlocked equity and locked collateral from SDK at the same verified block',async()=>{
  const inputs:Array<unknown[]>=[];
  const readMarginEquity=async(...args:unknown[])=>{
    inputs.push(args);
    return {equity:-10n,lockedCollateral:50n,asOfBlock:100n};
  };
  const result=await createTotalEconomicEquityReader({rpc,readMarginEquity}).read({account,blockNumber:100n});
  assert.deepEqual(inputs,[[bank,account,100n]]);
  assert.equal(result.unlockedEquityRaw,-10n);
  assert.equal(result.lockedCollateralRaw,50n);
  assert.equal(result.totalEconomicEquityRaw,40n);
  assert.equal(result.blockHash,hash);
  assert.equal(result.timestampSec,BigInt(block.timestamp));
  assert.equal(result.riskExecutable,false);
});

test('rejects SDK block drift, missing collateral and negative locked collateral',async()=>{
  const reader=(value:unknown)=>createTotalEconomicEquityReader({rpc,readMarginEquity:async()=>value});
  await assert.rejects(reader({equity:0n,lockedCollateral:0n,asOfBlock:101n}).read({account,blockNumber:100n}),/SDK_BLOCK_MISMATCH/);
  await assert.rejects(reader({equity:0n,asOfBlock:100n}).read({account,blockNumber:100n}),/INVALID_MARGIN_EQUITY/);
  await assert.rejects(reader({equity:0n,lockedCollateral:-1n,asOfBlock:100n}).read({account,blockNumber:100n}),/INVALID_MARGIN_EQUITY/);
});

test('rejects changed block hash, wrong chain, malformed account and malformed response',async()=>{
  let blockReads=0;
  const changed=async(method:string)=>method==='eth_chainId'?'0xc4cf':method==='eth_getBlockByNumber'?{
    ...block,hash:++blockReads===1?hash:'0x'+'b'.repeat(64)}:undefined;
  const readMarginEquity=async()=>({equity:100n,lockedCollateral:0n,asOfBlock:100n});
  await assert.rejects(createTotalEconomicEquityReader({rpc:changed,readMarginEquity}).read({account,blockNumber:100n}),/REORG_DETECTED/);
  await assert.rejects(createTotalEconomicEquityReader({rpc:async()=> '0x1',readMarginEquity}).read({account,blockNumber:100n}),/WRONG_CHAIN/);
  await assert.rejects(createTotalEconomicEquityReader({rpc,readMarginEquity}).read({account:'0x123',blockNumber:100n}),/INVALID_ACCOUNT/);
  await assert.rejects(createTotalEconomicEquityReader({rpc,readMarginEquity}).read({account,blockNumber:-1n}),/INVALID_BLOCK/);
  await assert.rejects(createTotalEconomicEquityReader({rpc:async(method)=>method==='eth_chainId'?'0xc4cf':{number:'0x63',hash,timestamp:'0x1'},readMarginEquity}).read({account,blockNumber:100n}),/INVALID_BLOCK_RESPONSE/);
});
