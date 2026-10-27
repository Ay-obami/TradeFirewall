import assert from 'node:assert/strict';
import test from 'node:test';
import {createGateExecutionPort} from '../../src/execution/gate-execution.ts';

const owner='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const bot='0x1111111111111111111111111111111111111111';
const gate='0x2222222222222222222222222222222222222222';
const pool='0x3333333333333333333333333333333333333333';
const hash='0x'+'a'.repeat(64);
const intent={account:owner,market:pool,side:'buy' as const,orderType:'limit' as const,
  priceRaw:1000n,quantityRaw:20n,clientOrderId:'trade-001'};

function setup(overrides:Record<string,unknown>={}){
  const submitted:unknown[]=[];
  const deps={chainId:50383,botWalletAddress:bot,tradingOwner:owner,gateAddress:gate,
    nowMs:()=>1_000_000,
    lookupMarket:async()=>({chainId:50383,pool,tickSize:10n,lotSize:5n,minQuantity:5n,maxQuantity:100n,minPriceRaw:100n,maxPriceRaw:10000n}),
    resolveOrderFields:async()=>({userData:7n,expireTimestampNs:1_200_000_000_000n,nonce:5n,
      deadlineSec:1100n,orderType:0,selfMatchingOption:0}),
    readGateState:async()=>({chainId:50383,address:gate,bot,tradingOwner:owner,paused:false,
      contractDeployed:true,marketEnabled:true,operatorAuthorized:true}),
    sendGateOrder:async(order:unknown)=>{submitted.push(order);return {transactionHash:hash}},
    ...overrides};
  return {port:createGateExecutionPort(deps as any),submitted};
}

test('prepares exact unsigned Gate.submit order with no signer and submits once through gate',async()=>{
  const {port,submitted}=setup();
  const prepared=await port.preview(intent);
  assert.equal(prepared.to,gate);
  assert.equal(prepared.order.pool,pool);
  assert.equal(prepared.order.isBid,true);
  assert.equal(prepared.order.price,1000n);
  assert.equal(prepared.order.quantity,20n);
  assert.equal(prepared.order.nonce,5n);
  assert.equal(prepared.order.expireTimestampNs,1_200_000_000_000n);
  assert.equal(submitted.length,0);
  const result=await port.submitOrder(intent);
  assert.equal(result.transactionHash,hash);
  assert.equal(submitted.length,1);
  await assert.rejects(port.submitOrder(intent),/DUPLICATE_INTENT/);
});

test('rejects an unconfigured, unapproved, or non-contract operator gate before sending',async()=>{
  for(const state of [{contractDeployed:false},{marketEnabled:false},{operatorAuthorized:false},{paused:true},{bot:owner},{tradingOwner:bot},{chainId:1}]){
    const {port,submitted}=setup({readGateState:async()=>({chainId:50383,address:gate,bot,tradingOwner:owner,
      paused:false,contractDeployed:true,marketEnabled:true,operatorAuthorized:true,...state})});
    await assert.rejects(port.submitOrder(intent),/GATE_NOT_READY/);
    assert.equal(submitted.length,0);
  }
});

test('rejects wrong-chain, wrong-owner, malformed sizing and missing order semantics',async()=>{
  await assert.rejects(setup({chainId:1}).port.preview(intent),/WRONG_CHAIN/);
  await assert.rejects(setup().port.preview({...intent,account:bot}),/TRADING_OWNER_MISMATCH/);
  await assert.rejects(setup().port.preview({...intent,quantityRaw:21n}),/QUANTITY_NOT_ON_LOT/);
  await assert.rejects(setup().port.preview({...intent,orderType:'market'} as any),/UNSUPPORTED_ORDER_TYPE/);
  await assert.rejects(setup({resolveOrderFields:async()=>({userData:7n,expireTimestampNs:0n,nonce:5n,deadlineSec:0n,
    orderType:0,selfMatchingOption:0})}).port.preview(intent),/INVALID_ORDER_LIFETIME/);
});

test('cannot rebroadcast on ambiguous submission failure',async()=>{
  let tries=0;
  const {port}=setup({sendGateOrder:async()=>{tries++;throw Error('rpc died after send')}});
  await assert.rejects(port.submitOrder(intent),/AMBIGUOUS_BROADCAST/);
  await assert.rejects(port.submitOrder(intent),/DUPLICATE_INTENT/);
  assert.equal(tries,1);
});
