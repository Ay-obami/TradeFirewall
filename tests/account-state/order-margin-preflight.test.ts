import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderMarginPreflight } from '../../src/account-state/order-margin-preflight.ts';

const pool='0x2222222222222222222222222222222222222222' as const;
const marginBank='0x3333333333333333333333333333333333333333' as const;
const account='0x1111111111111111111111111111111111111111' as const;
const order={pool,marginBank,account,isBid:true,quantity:100n,price:300n,expectedBlock:700n};
const accepted={priceable:true,asOfBlock:700n,hasCollateralForLock:true,meetsInitialMargin:true,voucherBlocked:false,restrictedBlocked:false,isolationBlocked:false,sufficient:true};

test('checks official SDK order margin at the same risk block without a signer',async()=>{
  let received:unknown;
  const gate=createOrderMarginPreflight({readChainId:async()=>50383,client:{previewPerpOrderMargin:async(arg)=>{received=arg;return accepted;}}});
  const result=await gate.check(order);
  assert.deepEqual(received,{pool,marginBank,account,isBid:true,quantity:100n,price:300n});
  assert.equal(result.asOfBlock,700n);
  assert.equal(result.admission,'SDK_MARGIN_PASSED');
  assert.equal(result.readyForTrading,false);
});

test('refuses stale market, conflicting block, or failed protocol margin gate',async()=>{
  for (const rejected of [
    {priceable:false,asOfBlock:700n},
    {...accepted,asOfBlock:701n},
    {...accepted,sufficient:false},
    {...accepted,voucherBlocked:true},
    {...accepted,meetsInitialMargin:false},
  ]) {
    const gate=createOrderMarginPreflight({readChainId:async()=>50383,client:{previewPerpOrderMargin:async()=>rejected}});
    await assert.rejects(gate.check(order),/SDK_MARGIN_NOT_VERIFIED/);
  }
});

test('refuses wrong chain and invalid order before reaching SDK',async()=>{
  let calls=0;
  const sdk={previewPerpOrderMargin:async()=>{calls++;return accepted;}};
  await assert.rejects(createOrderMarginPreflight({readChainId:async()=>1,client:sdk}).check(order),/WRONG_CHAIN/);
  await assert.rejects(createOrderMarginPreflight({readChainId:async()=>50383,client:sdk}).check({...order,quantity:0n}),/INVALID_ORDER/);
  assert.equal(calls,0);
});
