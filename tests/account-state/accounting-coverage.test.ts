import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessAccountingCoverage, ACCOUNTING_DOMAINS} from '../../src/account-state/accounting-coverage.ts';

const account='0x'+'12'.repeat(20);
const hash='0x'+'ab'.repeat(32);
const evidence=(domain:string)=>({domain,source:'VERIFIED_CHAIN_LOGS',chainId:50383,
  account,fromExclusive:10n,toInclusive:20n,baselineHash:hash,currentHash:hash,
  eventAbiAttested:true,contractInventoryAttested:true,economicSemanticsAttested:true,
  crossContractReceiptsReconciled:true,unknownEvents:0,unresolvedReceipts:0});

test('fails closed when accounting domains are absent despite a complete MarginBank scan',()=>{
  const result=assessAccountingCoverage({account,fromExclusive:10n,toInclusive:20n,
    evidence:[evidence('deposits_withdrawals')]});
  assert.equal(result.complete,false);
  assert.equal(result.riskExecutable,false);
  assert.equal(result.dailyLossUsd6,null);
  assert.deepEqual(result.missingDomains,ACCOUNTING_DOMAINS.filter(d=>d!=='deposits_withdrawals'));
});

test('rejects unchecked event semantics and unresolved receipts per domain',()=>{
  const result=assessAccountingCoverage({account,fromExclusive:10n,toInclusive:20n,
    evidence:[{...evidence('funding'),economicSemanticsAttested:false,unknownEvents:2,unresolvedReceipts:1}]});
  const funding=result.domains.find(d=>d.domain==='funding');
  assert.deepEqual(funding?.blockers,['ECONOMIC_SEMANTICS_UNATTESTED','UNKNOWN_EVENTS','UNRESOLVED_RECEIPTS']);
});

test('rejects mixed account, block range, hashes and unverified source',()=>{
  const result=assessAccountingCoverage({account,fromExclusive:10n,toInclusive:20n,
    evidence:[{...evidence('fees'),account:'0x'+'34'.repeat(20),fromExclusive:9n,
      currentHash:'invalid',source:'CALLER_ASSERTION'}]});
  assert.deepEqual(result.domains.find(d=>d.domain==='fees')?.blockers,
    ['UNVERIFIED_SOURCE','ACCOUNT_MISMATCH','RANGE_MISMATCH','INVALID_BLOCK_HASH']);
});

test('rejects duplicates, unknown domains and malformed coverage counts',()=>{
  const result=assessAccountingCoverage({account,fromExclusive:10n,toInclusive:20n,
    evidence:[evidence('liquidations'),evidence('liquidations'),evidence('some_new_protocol_path'),
      {...evidence('positions'),unknownEvents:-1}]});
  assert.ok(result.blockers.includes('DUPLICATE_DOMAIN_EVIDENCE'));
  assert.ok(result.blockers.includes('UNKNOWN_ACCOUNTING_DOMAIN'));
  assert.ok(result.domains.find(d=>d.domain==='positions')?.blockers.includes('INVALID_COUNTS'));
});

test('rejects inconsistent block hashes across otherwise valid domain receipts',()=>{
  const result=assessAccountingCoverage({account,fromExclusive:10n,toInclusive:20n,
    evidence:[evidence('funding'),{...evidence('fees'),currentHash:'0x'+'cd'.repeat(32)}]});
  assert.ok(result.blockers.includes('INCONSISTENT_SNAPSHOT_HASHES'));
  assert.equal(result.evidenceClaimsComplete,false);
});

test('even exhaustive caller-provided domain attestations do not grant accounting authority',()=>{
  const result=assessAccountingCoverage({account,fromExclusive:10n,toInclusive:20n,
    evidence:ACCOUNTING_DOMAINS.map(evidence)});
  assert.equal(result.evidenceClaimsComplete,true);
  assert.equal(result.complete,false);
  assert.equal(result.riskExecutable,false);
  assert.equal(result.dailyPnlUsd6,null);
  assert.equal(result.dailyLossUsd6,null);
  assert.ok(result.blockers.includes('INDEPENDENT_CROSS_CONTRACT_PROVENANCE_NOT_VERIFIED'));
  assert.ok(result.blockers.includes('USD6_COLLATERAL_VALUATION_NOT_VERIFIED'));
});
