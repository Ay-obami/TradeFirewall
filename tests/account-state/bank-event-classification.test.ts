import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBankEvent, SDK_MARGIN_BANK_EVENT_NAMES} from '../../src/account-state/bank-event-classification.ts';

// Independently transcribed from @somnia-chain/markets-sdk@0.32.1
// package/src/eventsAbi.ts; unknown names must fail closed.
const expected:[string,string,string|null][]=[
  ['PositionUpdated','trading',null],
  ['FundingSettled','trading','payment'],
  ['Deposited','external_transfer','amount'],
  ['DepositedFor','external_transfer','amount'],
  ['Withdrawn','external_transfer','amount'],
  ['CollateralLocked','internal_collateral','amount'],
  ['CollateralUnlocked','internal_collateral','amount'],
  ['FeeCharged','trading','amount'],
  ['RebatePaid','trading','amount'],
  ['AutoDeleveraged','trading',null],
  ['CloseOutMarginSettled','external_transfer','amount'],
  ['BadDebtAbsorbed','trading','covered'],
  ['PositionTransferred','external_transfer','collateralTransferred'],
  ['LiquidationOrderPanicked','ignored',null],
  ['MainFundedChild','external_transfer','amount'],
  ['IsolatedModeSet','ignored',null],
  ['MaxLeverageSet','ignored',null],
  ['BuilderFeeCharged','trading','amount'],
];

test('accounts for all eighteen published MarginBank event names with economic role and field',()=>{
  assert.deepEqual([...SDK_MARGIN_BANK_EVENT_NAMES],expected.map(x=>x[0]));
  for(const [name,category,amountField] of expected){
    assert.deepEqual({category:classifyBankEvent(name).category,amountField:classifyBankEvent(name).amountField},
      {category,amountField},name);
  }
});

test('transfer directions are account-role aware, without treating trading events as external cash',()=>{
  assert.deepEqual(classifyBankEvent('MainFundedChild').transferRoles,{child:1,payer:-1});
  assert.deepEqual(classifyBankEvent('CloseOutMarginSettled').transferRoles,{from:-1,to:1});
  assert.deepEqual(classifyBankEvent('PositionTransferred').transferRoles,{from:-1,to:1});
  assert.deepEqual(classifyBankEvent('Withdrawn').transferRoles,{account:-1});
  assert.deepEqual(classifyBankEvent('DepositedFor').transferRoles,{account:1});
  assert.deepEqual(classifyBankEvent('FundingSettled').transferRoles,{});
  assert.deepEqual(classifyBankEvent('BadDebtAbsorbed').transferRoles,{});
});

test('fails closed for SDK-omitted voucher and unknown events',()=>{
  for(const name of ['AccountCredited','CreditReclaimed','FundedPrincipalReturned','BogusEvent']){
    assert.throws(()=>classifyBankEvent(name),/UNCLASSIFIED_BANK_EVENT/);
  }
});

test('event classifications cannot be rewritten by downstream consumers',()=>{
  const deposited=classifyBankEvent('Deposited');
  assert.equal(Object.isFrozen(deposited),true);
  assert.equal(Object.isFrozen(deposited.transferRoles),true);
  assert.throws(()=>{(deposited as {category:string}).category='ignored';},TypeError);
  assert.throws(()=>{(deposited.transferRoles as Record<string,number>).account=-1;},TypeError);
  assert.equal(classifyBankEvent('Deposited').category,'external_transfer');
  assert.equal(Object.isFrozen(classifyBankEvent('FundingSettled')),true);
  assert.equal(Object.isFrozen(classifyBankEvent('CollateralLocked')),true);
});
