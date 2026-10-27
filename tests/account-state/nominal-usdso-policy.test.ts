import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNominalUsdso6EquityDeclineAlert} from '../../src/account-state/nominal-usdso-policy.ts';

const account='0x1111111111111111111111111111111111111111';
const token='0xed7993A74dAe1e6656B704A424DcD8711aAf4F72';
const hash='0x'+'ab'.repeat(32);
const start={account,chainId:50383,blockNumber:90n,blockHash:'0x'+'cd'.repeat(32),
  equityRaw:10_000_000_000_000_000_000n,authority:'VERIFIED_HISTORICAL_CHAIN_READ',riskExecutable:false};
const end={...start,blockNumber:100n,blockHash:hash,equityRaw:8_999_999_999_999_999_999n};
const identity={chainId:50383,blockNumber:100n,blockHash:hash,collateralAddress:token,
  collateralDecimals:18,authority:'BLOCK_PINNED_PERPS_COLLATERAL_IDENTITY',riskExecutable:false};
const base={account,startEquity:start,endEquity:end,collateralIdentity:identity,nominalDeclineAlertThreshold6:1_000_000n};

test('conservatively rounds an unadjusted equity decline and raises a heuristic alert',()=>{
  const result=evaluateNominalUsdso6EquityDeclineAlert(base);
  assert.equal(result.unadjustedEquityDeltaNominalUsdso6,'-1000001');
  assert.equal(result.unadjustedDeclineNominalUsdso6,'1000001');
  assert.equal(result.exceedsUnadjustedDeclineAlertThreshold,true);
  assert.equal(result.pnlAuthority,'NOT_ESTABLISHED');
  assert.equal(result.lossAuthority,'NOT_ESTABLISHED');
  assert.equal(result.utcDayBoundaryVerified,false);
  assert.equal(result.riskExecutable,false);
  assert.equal(result.usdValue6,null);
  assert.equal(result.unit,'NOMINAL_USDSO6');
});

test('floors positive unadjusted delta and does not alert at the exact threshold',()=>{
  const profit=evaluateNominalUsdso6EquityDeclineAlert({...base,endEquity:{...end,equityRaw:10_000_000_000_000_000_001n}});
  assert.equal(profit.unadjustedEquityDeltaNominalUsdso6,'0');
  assert.equal(profit.unadjustedDeclineNominalUsdso6,'0');
  assert.equal(profit.exceedsUnadjustedDeclineAlertThreshold,false);
  assert.equal(profit.riskExecutable,false);
  const exact=evaluateNominalUsdso6EquityDeclineAlert({...base,endEquity:{...end,equityRaw:9_000_000_000_000_000_000n}});
  assert.equal(exact.unadjustedDeclineNominalUsdso6,'1000000');
  assert.equal(exact.exceedsUnadjustedDeclineAlertThreshold,false);
});

test('withdrawals cannot be presented as trading losses and deposits cannot be presented as trading profits',()=>{
  const withdrawal=evaluateNominalUsdso6EquityDeclineAlert(base);
  const deposit=evaluateNominalUsdso6EquityDeclineAlert({...base,endEquity:{...end,equityRaw:11_000_000_000_000_000_000n}});
  assert.equal(withdrawal.lossAuthority,'NOT_ESTABLISHED');
  assert.equal(deposit.pnlAuthority,'NOT_ESTABLISHED');
  assert.equal(withdrawal.authority,'UNADJUSTED_EQUITY_DELTA_HEURISTIC');
  assert.equal(deposit.authority,'UNADJUSTED_EQUITY_DELTA_HEURISTIC');
  assert.equal(withdrawal.riskExecutable,false);
  assert.equal(deposit.riskExecutable,false);
});

test('requires authoritative historical equity at both boundaries; caller flags never substitute for it',()=>{
  for(const field of ['startEquity','endEquity'] as const){
    assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,[field]:{...base[field],authority:'PROVISIONAL_BANK_FLOW_RECONCILIATION',riskExecutable:true}}),/UNVERIFIED_HISTORICAL_EQUITY/);
    assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,[field]:null as never}),/UNVERIFIED_HISTORICAL_EQUITY/);
  }
});

test('rejects unverifiable collateral identity, decimals, block hash, and mismatched account or chain',()=>{
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,collateralIdentity:{...identity,collateralDecimals:6}}),/UNVERIFIED_USDSO_IDENTITY/);
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,collateralIdentity:{...identity,authority:'CALLER_ASSERTED'}}),/UNVERIFIED_USDSO_IDENTITY/);
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,collateralIdentity:{...identity,blockHash:'0x'+'aa'.repeat(32)}}),/IDENTITY_BLOCK_MISMATCH/);
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,startEquity:{...start,account:'0x'+'22'.repeat(20)}}),/EQUITY_ACCOUNT_MISMATCH/);
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,endEquity:{...end,chainId:1}}),/WRONG_CHAIN/);
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,endEquity:{...end,blockNumber:89n}}),/INVALID_EQUITY_ORDER/);
});

test('rejects malformed risk limits and does not confuse negative equity with negative daily PnL',()=>{
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,nominalDeclineAlertThreshold6:-1n}),/INVALID_NOMINAL_LIMIT/);
  assert.throws(()=>evaluateNominalUsdso6EquityDeclineAlert({...base,nominalDeclineAlertThreshold6:1 as never}),/INVALID_NOMINAL_LIMIT/);
  const result=evaluateNominalUsdso6EquityDeclineAlert({...base,startEquity:{...start,equityRaw:-10n},endEquity:{...end,equityRaw:-9n}});
  assert.equal(result.unadjustedEquityDeltaNominalUsdso6,'0');
  assert.equal(result.unadjustedDeclineNominalUsdso6,'0');
});
