import assert from 'node:assert/strict';
import test from 'node:test';
import {assessDeploymentReadiness} from '../../src/execution/ready-to-deploy-checklist.ts';

const owner='0x1111111111111111111111111111111111111111';
const bot='0x2222222222222222222222222222222222222222';
const hash='0x'+'a'.repeat(64);
const gate={chainId:50383,address:'0x3333333333333333333333333333333333333333',
  tradingOwner:owner,bot,contractDeployed:true,paused:false,marketEnabled:true,
  operatorAuthorized:true,marketLimits:{maxQuantityRaw:100n,minPriceRaw:1n,maxPriceRaw:1000n},
  remainingGrossQuantityRaw:200n,blockHash:hash,riskExecutable:false};
const full=()=>({funding:{balanceWei:10n,minimumGasWei:1n},admin:{authorized:true},
  gate:{...gate},expected:{owner,bot},risk:{approved:true,blockHash:hash}});

test('reports five independently ready categories but does not claim live trading proof',()=>{
  const report=assessDeploymentReadiness(full());
  assert.equal(report.readyForDeployment,true);
  assert.equal(report.readyForTrading,false);
  assert.deepEqual(report.blockers,[]);
  assert.deepEqual(Object.values(report.checks).map(x=>x.status),['ready','ready','ready','ready','ready']);
});

test('gas-free wallet is a funding blocker while other evidence remains visible',()=>{
  const report=assessDeploymentReadiness({...full(),funding:{balanceWei:0n,minimumGasWei:1n}});
  assert.equal(report.readyForDeployment,false);
  assert.equal(report.checks.funding.status,'blocked');
  assert.equal(report.checks.admin.status,'ready');
  assert.equal(report.checks.operator.status,'ready');
  assert.deepEqual(report.blockers,['funding: insufficient gas balance']);
});

test('missing evidence remains unverified rather than silently approved',()=>{
  const report=assessDeploymentReadiness({});
  assert.equal(report.readyForDeployment,false);
  assert.deepEqual(Object.values(report.checks).map(x=>x.status),Array(5).fill('unverified'));
  assert.equal(report.blockers.length,5);
});

test('explicit admin denial and operator denial are distinct blockers',()=>{
  const input=full();
  const report=assessDeploymentReadiness({...input,admin:{authorized:false},gate:{...gate,operatorAuthorized:false}});
  assert.equal(report.checks.admin.status,'blocked');
  assert.equal(report.checks.operator.status,'blocked');
  assert.ok(report.blockers.some(x=>x.startsWith('admin:')));
  assert.ok(report.blockers.some(x=>x.startsWith('operator:')));
});

test('mismatched gate owner/bot, pause and invalid market exposure cannot pass',()=>{
  const report=assessDeploymentReadiness({...full(),gate:{...gate,tradingOwner:bot,paused:true,remainingGrossQuantityRaw:0n}});
  assert.equal(report.checks.gate.status,'blocked');
  assert.equal(report.readyForDeployment,false);
});

test('risk approval is bound to chain snapshot and cannot be inferred from gate state',()=>{
  const input=full();
  assert.equal(assessDeploymentReadiness({...input,risk:undefined}).checks.risk.status,'unverified');
  assert.equal(assessDeploymentReadiness({...input,risk:{approved:true,blockHash:'0x'+'b'.repeat(64)}}).checks.risk.status,'blocked');
  assert.equal(assessDeploymentReadiness({...input,risk:{approved:false,blockHash:hash}}).checks.risk.status,'blocked');
});

test('invalid balance, network and incomplete gate evidence fail closed',()=>{
  assert.equal(assessDeploymentReadiness({...full(),funding:{balanceWei:-1n,minimumGasWei:1n}}).checks.funding.status,'blocked');
  assert.equal(assessDeploymentReadiness({...full(),gate:{...gate,chainId:1}}).checks.gate.status,'blocked');
  assert.equal(assessDeploymentReadiness({...full(),gate:undefined}).checks.operator.status,'unverified');
});
