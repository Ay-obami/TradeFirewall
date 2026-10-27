import assert from 'node:assert/strict';
import test from 'node:test';
import {createGuardedGateWorkflow} from '../../src/integration/guarded-gate.ts';
import type {TradeIntent,MarketSnapshot} from '../../src/adapter/guarded-executor.ts';
import type {RiskPolicy} from '../../src/policy/evaluate.ts';

const account='0x1111111111111111111111111111111111111111' as const;
const bot='0x3333333333333333333333333333333333333333' as const;
const market='0x2222222222222222222222222222222222222222' as const;
const gate='0x4444444444444444444444444444444444444444' as const;
const tx='0x'+'9'.repeat(64);
const intent:TradeIntent={account,market,side:'buy',orderType:'limit',priceRaw:100n,quantityRaw:10n,clientOrderId:'unique-1'};
const state:MarketSnapshot={chainId:50383,account,market,blockNumber:1n,observedAtMs:1000,
  markPriceRaw:100n,availableMarginRaw:1000n,currentPositionRaw:0n,snapshotId:'verified-1'};
const policy:RiskPolicy={allowedMarkets:['BTC-PERP'],maxLeverageBps:50000,
  maxOrderNotionalUsd6:'1000000',maxPositionNotionalUsd6:'1000000',maxSlippageBps:100,
  maxDailyLossUsd6:'1000000',maxSnapshotAgeMs:500};

function setup(options:{live?:boolean;readiness?:boolean;permission?:boolean}={}){
  let sent=0;let riskReads=0;let gateReads=0;
  const workflow=createGuardedGateWorkflow({
    gate:{chainId:50383,botWalletAddress:bot,tradingOwner:account,gateAddress:gate,
      nowMs:()=>1100,lookupMarket:async()=>({chainId:50383,pool:market,tickSize:1n,lotSize:1n,
        minQuantity:1n,maxQuantity:100n,minPriceRaw:1n,maxPriceRaw:10000n}),
      resolveOrderFields:async()=>({userData:1n,expireTimestampNs:2000000000n,nonce:7n,deadlineSec:20n,
        orderType:0,selfMatchingOption:0}),
      readGateState:async()=>{gateReads++;return {chainId:50383,address:gate,bot,tradingOwner:account,
        paused:false,contractDeployed:true,marketEnabled:true,operatorAuthorized:options.permission??true};},
      sendGateOrder:async(request)=>{assert.equal(request.to,gate);sent++;return {transactionHash:tx};}},
    liveEnabled:options.live??false,
    ...(options.readiness?{assertRiskReadiness:async()=>{riskReads++;return {chainId:50383,account,
      provenance:'VERIFIED_BLOCK_PINNED_RISK' as const,riskProvenanceVerified:true};}}:{}),
    readSnapshot:async()=>state,nowMs:()=>1100,policy,
    resolveRisk:async()=>({marketSymbol:'BTC-PERP',leverageBps:10000,slippageBps:0,
      lotSizeRaw:1n,quoteNotionalUsd6:(n:bigint)=>(n*1000n).toString(),
      riskContext:{nowMs:1100,observedAtMs:1000,signedPositionUsd6:'0',dailyPnlUsd6:'0',equityUsd6:'1000000'}}),
  });
  return {workflow,stats:()=>({sent,riskReads,gateReads})};
}

test('dry-run previews TradeFirewallGate.submit order and never invokes signer',async()=>{
  const {workflow,stats}=setup();
  const prepared=await workflow.prepare(intent);
  assert.equal(prepared.action,'approved');
  if(prepared.action!=='approved')return;
  const dry=await workflow.dryRun(prepared.approvalId);
  assert.equal(dry.gateRequest.to,gate);
  assert.equal(dry.gateRequest.order.pool,market);
  assert.equal(dry.gateRequest.order.quantity,10n);
  assert.equal(stats().sent,0);
  await assert.rejects(workflow.executeLive(prepared.approvalId),/LIVE_EXECUTION_DISABLED/);
});

test('live workflow requires actual separately configured risk readiness',async()=>{
  const {workflow,stats}=setup({live:true});
  const prepared=await workflow.prepare(intent);
  assert.equal(prepared.action,'approved');
  if(prepared.action!=='approved')return;
  await assert.rejects(workflow.executeLive(prepared.approvalId),/LIVE_RISK_READINESS_NOT_VERIFIED/);
  assert.equal(stats().sent,0);
});

test('permitted gate path executes exactly one guarded contract submission',async()=>{
  const {workflow,stats}=setup({live:true,readiness:true});
  const prepared=await workflow.prepare(intent);
  assert.equal(prepared.action,'approved');
  if(prepared.action!=='approved')return;
  const executed=await workflow.executeLive(prepared.approvalId);
  assert.equal(executed.transactionHash,tx);
  assert.deepEqual(stats(),{sent:1,riskReads:1,gateReads:1});
  await assert.rejects(workflow.executeLive(prepared.approvalId),/INVALID_APPROVAL/);
});

test('operator permission failure prevents gate signer execution',async()=>{
  const {workflow,stats}=setup({live:true,readiness:true,permission:false});
  const prepared=await workflow.prepare(intent);
  assert.equal(prepared.action,'approved');
  if(prepared.action!=='approved')return;
  await assert.rejects(workflow.executeLive(prepared.approvalId),/GATE_NOT_READY/);
  assert.equal(stats().sent,0);
});
