import test from 'node:test';
import assert from 'node:assert/strict';
import {createSdkPositionCrosscheck} from '../../src/account-state/sdk-position-crosscheck.ts';

const account='0x1111111111111111111111111111111111111111';
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const hash='0x'+'a'.repeat(64);
const position={asOfBlock:42n,pool:'0x2222222222222222222222222222222222222222',
  size:2n,priceable:true,notional:100n,unrealizedPnl:-12n,accruedFunding:3n,equityContribution:-15n};
const deps=()=>({
  rpc:async(method:string)=>method==='eth_chainId'?'0xc4cf':
    method==='eth_getBlockByNumber'?{number:'0x2a',hash,timestamp:'0x64'}:null,
  listPositionAnalytics:async()=>[position],
});

test('crosschecks one-block protocol position PnL and never certifies daily risk',async()=>{
  const report=await createSdkPositionCrosscheck(deps()).read({account,marginBank:bank});
  assert.equal(report.blockNumber,42n);
  assert.equal(report.totalUnrealizedPnlRaw,-12n);
  assert.equal(report.totalFundingOwedRaw,3n);
  assert.equal(report.totalEquityContributionRaw,-15n);
  assert.equal(report.riskExecutable,false);
});

test('rejects analytics from inconsistent blocks, without treating them as one snapshot',async()=>{
  const reader=createSdkPositionCrosscheck({...deps(),listPositionAnalytics:async()=>[
    position,{...position,asOfBlock:43n},
  ]});
  await assert.rejects(reader.read({account,marginBank:bank}),/BLOCK_MISMATCH/);
});

test('rejects mismatched or unpriceable economic metrics and invalid network',async()=>{
  await assert.rejects(createSdkPositionCrosscheck({...deps(),listPositionAnalytics:async()=>[
    {...position,equityContribution:-14n},
  ]}).read({account,marginBank:bank}),/EQUITY_CONTRIBUTION_MISMATCH/);
  await assert.rejects(createSdkPositionCrosscheck({...deps(),listPositionAnalytics:async()=>[
    {...position,priceable:false},
  ]}).read({account,marginBank:bank}),/UNPRICEABLE_POSITION/);
  await assert.rejects(createSdkPositionCrosscheck({...deps(),rpc:async()=> '0x1'}).read({account,marginBank:bank}),/WRONG_CHAIN/);
});
