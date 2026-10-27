import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGateReceiptEvidence} from '../../src/execution/gate-receipt-reconciliation.ts';

const bot='0x1111111111111111111111111111111111111111';
const owner='0x2222222222222222222222222222222222222222';
const gate='0x3333333333333333333333333333333333333333';
const pool='0x4444444444444444444444444444444444444444';
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),topic='0x'+'c'.repeat(64),runtimeHash='0x'+'d'.repeat(64);
const word=(n:bigint)=>n.toString(16).padStart(64,'0');
const log={address:gate,topics:[topic,'0x'+pool.slice(2).padStart(64,'0'),'0x'+word(7n)],data:'0x'+word(9n)+word(8n)+word(13n),logIndex:1,removed:false};
const receipt={transactionHash:hash,from:bot,to:gate,status:'success',blockNumber:123n,blockHash,logs:[log]};
const request={chainId:50383,transactionHash:hash,bot,owner,gate,pool,nonce:7n,
  expectedRuntimeCodeHash:runtimeHash,proposedQuantity:9n};
function port(receiptValue:any=receipt,orderValue:any={owner,pool,orderId:13n,status:'open',asOfBlock:124n}){
  return {
    getChainId:async()=>50383,
    getTransactionReceipt:async()=>receiptValue,
    getBlockHash:async()=>blockHash,
    getGateRuntimeCodeHash:async()=>runtimeHash,
    getGateTradingOwner:async()=>owner,
    hashEventSignature:(signature:string)=>signature==='OrderForwarded(address,uint64,uint256,uint256,uint128)'?topic:'0x'+'0'.repeat(64),
    getExchangeOrder:async()=>orderValue,
  };
}

test('bot-signed gate receipt binds pool nonce owner quantity and separate exchange acceptance without claiming fill',async()=>{
  const result=await verifyGateReceiptEvidence(port(),request);
  assert.equal(result.kind,'gate_order_forwarded');
  assert.equal(result.bot,bot);
  assert.equal(result.tradingOwner,owner);
  assert.equal(result.pool,pool);
  assert.equal(result.nonce,7n);
  assert.equal(result.orderId,13n);
  assert.equal(result.submittedQuantity,8n);
  assert.equal(result.exchangeOrderObserved,true);
  assert.equal(result.fillConfirmed,false);
  assert.equal(result.riskExecutable,false);
});

test('refuses missing ABI code attestation and unknown event',async()=>{
  await assert.rejects(verifyGateReceiptEvidence({...port(),getGateRuntimeCodeHash:async()=> '0x'+'f'.repeat(64)},request),/GATE_ABI_NOT_ATTESTED/);
  await assert.rejects(verifyGateReceiptEvidence(port({...receipt,logs:[{...log,topics:['0x'+'f'.repeat(64),...log.topics.slice(1)]}]}),request),/ORDER_FORWARDED_NOT_VERIFIED/);
  await assert.rejects(verifyGateReceiptEvidence(port({...receipt,logs:[log,{...log,topics:['0x'+'f'.repeat(64),...log.topics.slice(1)]}]}),request),/ORDER_FORWARDED_NOT_VERIFIED/);
});

test('refuses owner sender destination hash and reverted tx mismatches',async()=>{
  for(const candidate of [{...receipt,from:owner},{...receipt,to:pool},{...receipt,transactionHash:'0x'+'f'.repeat(64)},{...receipt,status:'reverted'}]){
    await assert.rejects(verifyGateReceiptEvidence(port(candidate),request),/GATE_RECEIPT_/);
  }
});

test('refuses altered event fields, duplicate events, and invalid order IDs',async()=>{
  for(const candidate of [
    {...log,topics:[topic,'0x'+owner.slice(2).padStart(64,'0'),log.topics[2]]},
    {...log,topics:[topic,log.topics[1],'0x'+word(8n)]},
    {...log,data:'0x'+word(9n)+word(10n)+word(13n)},
    {...log,data:'0x'+word(9n)+word(8n)+word(0n)},
  ])await assert.rejects(verifyGateReceiptEvidence(port({...receipt,logs:[candidate]}),request),/ORDER_FORWARDED_NOT_VERIFIED/);
  await assert.rejects(verifyGateReceiptEvidence(port({...receipt,logs:[log,log]}),request),/ORDER_FORWARDED_NOT_VERIFIED/);
});

test('no exchange order or mismatched exchange ownership cannot become accepted-order evidence',async()=>{
  await assert.rejects(verifyGateReceiptEvidence(port(receipt,null),request),/EXCHANGE_ORDER_NOT_VERIFIED/);
  await assert.rejects(verifyGateReceiptEvidence(port(receipt,{owner:bot,pool,orderId:13n,status:'open',asOfBlock:124n}),request),/EXCHANGE_ORDER_NOT_VERIFIED/);
});

test('exchange acceptance must be observed no earlier than the gate receipt block',async()=>{
  await assert.rejects(verifyGateReceiptEvidence(port(receipt,{owner,pool,orderId:13n,status:'open',asOfBlock:122n}),request),/EXCHANGE_ORDER_NOT_VERIFIED/);
  await assert.rejects(verifyGateReceiptEvidence(port(receipt,{owner,pool,orderId:13n,status:'open'}),request),/EXCHANGE_ORDER_NOT_VERIFIED/);
});

test('changed block hash during asynchronous reconciliation fails closed',async()=>{
  let reads=0;
  await assert.rejects(verifyGateReceiptEvidence({...port(),getBlockHash:async()=>++reads===1?blockHash:'0x'+'e'.repeat(64)},request),/GATE_REORG_DETECTED/);
});
