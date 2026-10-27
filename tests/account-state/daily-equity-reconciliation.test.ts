import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileDailyEquity} from '../../src/account-state/daily-equity-reconciliation.ts';

const wallet='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const other='0x1111111111111111111111111111111111111111';
const baseline={account:wallet,blockNumber:10n,timestampSec:172800n,equityRaw:1000n};
const current={account:wallet,blockNumber:20n,timestampSec:173000n,equityRaw:1150n};
const event=(kind:string,amount:bigint,roles:Record<string,string>={account:wallet})=>({kind,amount,blockNumber:15n,logIndex:0,...roles});

test('equity delta excludes verified non-trading inflows and outflows',()=>{
  const result=reconcileDailyEquity({baseline,current,events:[
    event('Deposited',100n),
    {...event('Withdrawn',50n),logIndex:1},
    {...event('AccountCredited',30n),logIndex:2},
    {...event('CreditReclaimed',10n),logIndex:3},
    {...event('MainFundedChild',80n,{child:wallet,payer:other}),logIndex:4},
    {...event('FundedPrincipalReturned',20n,{child:wallet,payer:other}),logIndex:5},
  ],coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'}});
  // Net non-trading inflow: 100 - 50 + 30 - 10 + 80 - 20 = 130.
  assert.equal(result.tradingPnlRaw,20n);
  assert.equal(result.netNonTradingFlowRaw,130n);
  assert.equal(result.riskExecutable,false);
});

test('correctly signs receiving end of principal repayment and accounts for close-out transfers',()=>{
  const result=reconcileDailyEquity({baseline,current,events:[
    event('FundedPrincipalReturned',70n,{child:other,payer:wallet}),
    {...event('CloseOutMarginSettled',90n,{from:wallet,to:other}),logIndex:1},
  ],coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'}});
  assert.equal(result.netNonTradingFlowRaw,-20n);
  assert.equal(result.tradingPnlRaw,170n);
});

test('close-out transfers received are not mistaken for trading profit',()=>{
  const result=reconcileDailyEquity({baseline,current,events:[event('CloseOutMarginSettled',90n,{from:other,to:wallet})],
    coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'}});
  assert.equal(result.netNonTradingFlowRaw,90n);
  assert.equal(result.tradingPnlRaw,60n);
});

test('locking and unlocking collateral is not mistaken for a trading loss or gain',()=>{
  const locked=reconcileDailyEquity({baseline,current:{...current,equityRaw:900n},
    events:[event('CollateralLocked',100n)],coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'}});
  assert.equal(locked.tradingPnlRaw,0n);
  const unlocked=reconcileDailyEquity({baseline,current:{...current,equityRaw:1100n},
    events:[event('CollateralUnlocked',100n)],coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'}});
  assert.equal(unlocked.tradingPnlRaw,0n);
  const mixed=reconcileDailyEquity({baseline,current:{...current,equityRaw:850n},
    events:[event('CollateralLocked',100n)],coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'}});
  assert.equal(mixed.tradingPnlRaw,-50n);
});

test('unverified ledger, unclassified events and inconsistent ranges fail closed',()=>{
  const request={baseline,current,events:[event('Deposited',100n)],coverage:{complete:false,source:'VERIFIED_CHAIN_LOGS'}};
  assert.throws(()=>reconcileDailyEquity(request),/INCOMPLETE_LOG_COVERAGE/);
  assert.throws(()=>reconcileDailyEquity({...request,coverage:{complete:true,source:'UNKNOWN'}}),/UNVERIFIED_LOG_SOURCE/);
  assert.throws(()=>reconcileDailyEquity({...request,coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},events:[event('Unknown',10n)]}),/UNCLASSIFIED_BALANCE_EVENT/);
  assert.throws(()=>reconcileDailyEquity({...request,coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},events:[event('Deposited',-1n)]}),/INVALID_EVENT_AMOUNT/);
  assert.throws(()=>reconcileDailyEquity({...request,coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},events:[event('Deposited',1n,{account:other})]}),/IRRELEVANT_EVENT/);
  assert.throws(()=>reconcileDailyEquity({...request,coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},current:{...current,account:other}}),/MISMATCHED_ACCOUNT/);
  assert.throws(()=>reconcileDailyEquity({...request,coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},events:[{...event('Deposited',1n),blockNumber:21n}]}),/EVENT_OUTSIDE_RANGE/);
});
