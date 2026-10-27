import assert from 'node:assert/strict';
import test from 'node:test';
import {createVerifiedRiskReadiness,assertVerifiedRiskProof} from '../../src/integration/verified-risk-readiness.ts';

const account='0x1111111111111111111111111111111111111111' as const;
const market='0x2222222222222222222222222222222222222222' as const;
const gate='0x4444444444444444444444444444444444444444' as const;
const hash=`0x${'a'.repeat(64)}` as const;
const scope={chainId:50383,account,market,gateAddress:gate,blockNumber:12n,blockHash:hash,
  observedAtMs:1000,markPriceRaw:100n,snapshotId:`12:${hash}`};

function fixture(changes:Record<string,unknown>={}){
  const block={chainId:50383,number:12n,hash,timestampMs:1000};
  const policy={chainId:50383,account,market,blockNumber:12n,blockHash:hash,version:'policy-7',maxDailyLossUsd6:'100',maxSnapshotAgeMs:500};
  const loss={chainId:50383,account,market,blockNumber:12n,blockHash:hash,policyVersion:'policy-7',dailyPnlUsd6:'-10',equityUsd6:'1000'};
  const price={chainId:50383,market,blockNumber:12n,blockHash:hash,markPriceRaw:100n,source:'ONCHAIN_MARK'};
  const status={chainId:50383,account,market,gateAddress:gate,blockNumber:12n,blockHash:hash,contractDeployed:true,paused:false,marketEnabled:true,operatorAuthorized:true};
  return createVerifiedRiskReadiness({nowMs:()=>1100,readBlock:async()=>changes.block??block,
    readPolicy:async()=>changes.policy??policy,readDailyLoss:async()=>changes.loss??loss,
    readPrice:async()=>changes.price??price,readGate:async()=>changes.status??status});
}

test('issues only an opaque proof tied to the verified account, market, chain and block',async()=>{
  const proof=await fixture().verify(scope);
  assertVerifiedRiskProof(proof,scope);
  assert.throws(()=>assertVerifiedRiskProof({...proof,riskProvenanceVerified:true},scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
  assert.throws(()=>assertVerifiedRiskProof(proof,{...scope,blockNumber:13n}),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});

test('does not accept a forged boolean or provenance label as proof',()=>{
  assert.throws(()=>assertVerifiedRiskProof({chainId:50383,account,provenance:'VERIFIED_BLOCK_PINNED_RISK',riskProvenanceVerified:true},scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});

test('proof is one-use and expires at the verified policy risk-data deadline',async()=>{
  const proof=await fixture().verify(scope);
  assertVerifiedRiskProof(proof,scope,1100);
  assert.throws(()=>assertVerifiedRiskProof(proof,scope,1100),/LIVE_RISK_READINESS_NOT_VERIFIED/);
  const another=await fixture().verify(scope);
  assert.throws(()=>assertVerifiedRiskProof(another,scope,1501),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});

test('fails closed on mismatched policy, loss, price and gate provenance',async()=>{
  const mismatches=[
    {policy:{chainId:50383,account,market,blockNumber:11n,blockHash:hash,version:'policy-7',maxDailyLossUsd6:'100',maxSnapshotAgeMs:500}},
    {loss:{chainId:50383,account,market,blockNumber:12n,blockHash:hash,policyVersion:'policy-OTHER',dailyPnlUsd6:'-10',equityUsd6:'1000'}},
    {price:{chainId:50383,market,blockNumber:12n,blockHash:hash,markPriceRaw:101n,source:'ONCHAIN_MARK'}},
    {status:{chainId:50383,account,market,gateAddress:gate,blockNumber:12n,blockHash:hash,contractDeployed:true,paused:false,marketEnabled:true,operatorAuthorized:false}},
    {block:{chainId:50383,number:12n,hash:`0x${'b'.repeat(64)}`,timestampMs:1000}},
  ];
  for(const changed of mismatches)await assert.rejects(fixture(changed).verify(scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});

test('rejects daily loss beyond policy, stale evidence and unsupported price source',async()=>{
  const loss={chainId:50383,account,market,blockNumber:12n,blockHash:hash,policyVersion:'policy-7',dailyPnlUsd6:'-101',equityUsd6:'1000'};
  await assert.rejects(fixture({loss}).verify(scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
  await assert.rejects(fixture().verify({...scope,observedAtMs:1}),/LIVE_RISK_READINESS_NOT_VERIFIED/);
  const price={chainId:50383,market,blockNumber:12n,blockHash:hash,markPriceRaw:100n,source:'UNVERIFIED_API'};
  await assert.rejects(fixture({price}).verify(scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});
