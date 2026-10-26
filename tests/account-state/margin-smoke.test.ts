import assert from 'node:assert/strict';
import test from 'node:test';
import { runMarginDiagnosticSmoke } from '../../src/account-state/margin-smoke.ts';

const account='0x1111111111111111111111111111111111111111' as const;
const bank='0x2222222222222222222222222222222222222222' as const;
const state={unlockedCollateralBalance:0n,lockedCollateral:0n,activePerpPools:[],equity:0n,withdrawable:0n,imReq:0n,mmReq:0n,cmReq:0n,marginStatus:'HEALTHY'};

test('read-only smoke reports SDK MarginBank values without claiming risk-executable equity',async()=>{
  const actual=await runMarginDiagnosticSmoke({account,marginBank:bank,readChainId:async()=>50383,loadClient:async()=>({getMarginAccount:async()=>state})});
  assert.equal(actual.mode,'LIVE_ACCOUNT_READ_ONLY');
  assert.equal(actual.equityRaw,'0');
  assert.equal(actual.riskExecutable,false);
  assert.equal(actual.blockPinScope,'SDK_INTERNAL_SINGLE_CALL');
});

test('read-only smoke fails closed if SDK method is absent',async()=>{
  await assert.rejects(runMarginDiagnosticSmoke({account,marginBank:bank,readChainId:async()=>50383,loadClient:async()=>({})}),/MISSING_SDK_METHOD/);
});
