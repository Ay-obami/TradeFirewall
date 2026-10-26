import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuardedDreamdexWorkflow } from '../../src/integration/guarded-dreamdex.ts';
import type { TradeIntent, MarketSnapshot } from '../../src/adapter/guarded-executor.ts';
import type { RiskPolicy } from '../../src/policy/evaluate.ts';

const account = '0x1111111111111111111111111111111111111111' as const;
const market = '0x2222222222222222222222222222222222222222' as const;
const intent: TradeIntent = { account, market, side: 'buy', orderType: 'limit', priceRaw: 100n,
  quantityRaw: 10n, clientOrderId: 'dry-1' };
const state: MarketSnapshot = { chainId: 50383, account, market, blockNumber: 1n,
  observedAtMs: 1000, markPriceRaw: 100n, availableMarginRaw: 1000n,
  currentPositionRaw: 0n, snapshotId: 'verified-1' };
const policy: RiskPolicy = { allowedMarkets:['BTC-PERP'], maxLeverageBps:50000,
  maxOrderNotionalUsd6:'1000000', maxPositionNotionalUsd6:'1000000', maxSlippageBps:100,
  maxDailyLossUsd6:'1000000', maxSnapshotAgeMs:500 };
const tx = '0x' + '45'.repeat(32);

function setup(options:{ live?: boolean; wrongWallet?:boolean; readiness?:boolean }={}) {
  let submitted=0;
  let snapshots=0;
  const sdk = {
    chainId:50383,
    walletAddress:options.wrongWallet ? '0x3333333333333333333333333333333333333333' as const : account,
    lookupMarket:async()=>({pool:market,chainId:50383,tickSize:1n,lotSize:1n,minQuantity:1n,maxQuantity:100n}),
    trader:{placePerpOrder:async()=>{submitted++;return {transactionHash:tx};}},
  };
  const workflow=createGuardedDreamdexWorkflow({sdk,liveEnabled:options.live??false,
    ...(options.readiness ? {assertLiveReadiness:async()=>({chainId:50383,account,permissionVerified:true,riskProvenanceVerified:true})} : {}),
    readSnapshot:async()=>{snapshots++;return state;}, nowMs:()=>1100, policy,
    resolveRisk:async()=>({marketSymbol:'BTC-PERP',leverageBps:10000,slippageBps:0,
      lotSizeRaw:1n,quoteNotionalUsd6:(n:bigint)=>(n*1000n).toString(),
      riskContext:{nowMs:1100,observedAtMs:1000,signedPositionUsd6:'0',dailyPnlUsd6:'0',equityUsd6:'1000000'}}),
  });
  return {workflow, stats:()=>({submitted,snapshots})};
}

test('gas-free default prepares and consumes dry-run without ever touching trading SDK',async()=>{
  const {workflow,stats}=setup();
  const prepared=await workflow.prepare(intent);
  assert.equal(prepared.action,'approved');
  if(prepared.action!=='approved') return;
  const preview=await workflow.dryRun(prepared.approvalId);
  assert.equal(preview.mode,'dry-run');
  assert.deepEqual(preview.sdkParameters,{pool:market,isBid:true,price:100n,quantity:10n});
  assert.equal(stats().submitted,0);
  await assert.rejects(workflow.executeLive(prepared.approvalId),/LIVE_EXECUTION_DISABLED/);
});

test('wrong SDK wallet fails before requesting any account-risk snapshot',async()=>{
  const {workflow,stats}=setup({wrongWallet:true});
  await assert.rejects(workflow.prepare(intent),/SIGNER_ACCOUNT_MISMATCH/);
  assert.deepEqual(stats(),{submitted:0,snapshots:0});
});

test('live enablement cannot bypass missing verified readiness evidence',async()=>{
  const {workflow,stats}=setup({live:true});
  const prepared=await workflow.prepare(intent);
  assert.equal(prepared.action,'approved');
  if(prepared.action!=='approved') return;
  await assert.rejects(workflow.executeLive(prepared.approvalId),/LIVE_READINESS_NOT_VERIFIED/);
  assert.equal(stats().submitted,0);
});

test('mocked verified live readiness is checked before SDK submission and approval is one-use',async()=>{
  const {workflow,stats}=setup({live:true,readiness:true});
  const prepared=await workflow.prepare(intent);
  assert.equal(prepared.action,'approved');
  if(prepared.action!=='approved') return;
  const result=await workflow.executeLive(prepared.approvalId);
  assert.equal(result.transactionHash,tx);
  assert.equal(stats().submitted,1);
  await assert.rejects(workflow.executeLive(prepared.approvalId),/INVALID_APPROVAL/);
});
