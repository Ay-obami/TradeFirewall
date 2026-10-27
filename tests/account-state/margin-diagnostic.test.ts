import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarginDiagnostic } from '../../src/account-state/margin-diagnostic.ts';

const account='0x1111111111111111111111111111111111111111' as const;
const bank='0x2222222222222222222222222222222222222222' as const;
const pool='0x3333333333333333333333333333333333333333' as const;
const healthy={unlockedCollateralBalance:1000n,lockedCollateral:200n,activePerpPools:[pool],equity:1300n,withdrawable:900n,imReq:300n,mmReq:150n,cmReq:100n,marginStatus:'HEALTHY',asOfBlock:123456n};

test('SDK cross-margin account diagnostic preserves exact on-chain bigints without promoting them to order authority',async()=>{
  const client={getMarginAccount:async()=>healthy};
  const diagnostic=createMarginDiagnostic({client,readChainId:async()=>50383});
  const actual=await diagnostic.read({account,marginBank:bank});
  assert.equal(actual.equity,1300n);
  assert.equal(actual.unlockedCollateralBalance,1000n);
  assert.deepEqual(actual.activePerpPools,[pool]);
  assert.equal(actual.authority,'ADVISORY_ONLY');
  assert.equal(actual.blockPinScope,'SDK_INTERNAL_SINGLE_CALL');
  assert.equal(actual.asOfBlock,123456n);
  assert.equal(actual.riskExecutable,false);
  assert.equal('dailyPnlUsd6' in actual,false);
  assert.equal('blockHash' in actual,false);
});

test('rejects wrong chain before any SDK account read',async()=>{
  let called=false;
  const diagnostic=createMarginDiagnostic({readChainId:async()=>1,client:{getMarginAccount:async()=>{called=true;return healthy;}}});
  await assert.rejects(diagnostic.read({account,marginBank:bank}),/WRONG_CHAIN/);
  assert.equal(called,false);
});

test('refuses missing SDK method or incomplete and malformed margin payload',async()=>{
  const mk=(value:unknown)=>createMarginDiagnostic({readChainId:async()=>50383,client:{getMarginAccount:async()=>value}});
  await assert.rejects(createMarginDiagnostic({readChainId:async()=>50383,client:{}}).read({account,marginBank:bank}),/MISSING_SDK_METHOD/);
  await assert.rejects(mk({...healthy,equity:'1300'}).read({account,marginBank:bank}),/INVALID_MARGIN_ACCOUNT/);
  await assert.rejects(mk({...healthy,activePerpPools:['bad']}).read({account,marginBank:bank}),/INVALID_MARGIN_ACCOUNT/);
  await assert.rejects(mk({...healthy,imReq:-1n}).read({account,marginBank:bank}),/INVALID_MARGIN_ACCOUNT/);
  await assert.rejects(mk({...healthy,asOfBlock:undefined}).read({account,marginBank:bank}),/INVALID_MARGIN_ACCOUNT/);
  await assert.rejects(mk({...healthy,asOfBlock:-1n}).read({account,marginBank:bank}),/INVALID_MARGIN_ACCOUNT/);
});

test('refuses non-address identity before any RPC or SDK reads',async()=>{
  let requested=false;
  const diagnostic=createMarginDiagnostic({readChainId:async()=>{requested=true;return 50383;},client:{getMarginAccount:async()=>healthy}});
  await assert.rejects(diagnostic.read({account:'bad' as typeof account,marginBank:bank}),/INVALID_ADDRESS/);
  assert.equal(requested,false);
});
