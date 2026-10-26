import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePerpsOrderEvidence } from '../../src/execution/order-reconciliation.ts';

const account = '0x1111111111111111111111111111111111111111' as const;
const market = '0x2222222222222222222222222222222222222222' as const;
const router = '0x3333333333333333333333333333333333333333' as const;
const hash = `0x${'a'.repeat(64)}` as `0x${string}`;
const request = { chainId: 50383, account, market, orderId: 55n, transactionHash: hash };
const receipt = { transactionHash: hash, from: account, to: router, status: 'success', blockNumber: 100n };
const order = { orderId:55n, owner:account, market, originatingTransactionHash:hash, status:'open', observedBlock:102n };
const rpc = (r:unknown=receipt,o:unknown=order) => ({
  async getChainId(){return 50383;},
  async getTransactionReceipt(){return r;},
  async getOrderById(){return o;},
});

test('requires both mined receipt and independently read matching exchange order state', async () => {
  const proof = await reconcilePerpsOrderEvidence(rpc(), request);
  assert.deepEqual(proof, {
    kind:'verified_perps_order_state', chainId:50383, transactionHash:hash,
    account,market,orderId:55n,receiptBlock:100n,orderObservedBlock:102n,
    orderStatus:'open',perpsOrderConfirmed:true,perpsFillConfirmed:false,
  });
});

test('rejects absent or mismatched orders, even with a successful receipt', async () => {
  for(const observed of [null,{...order,owner:router},{...order,market:router},
    {...order,orderId:56n},{...order,originatingTransactionHash:`0x${'b'.repeat(64)}`},
    {...order,observedBlock:99n},{...order,status:'unknown'}]) {
    await assert.rejects(reconcilePerpsOrderEvidence(rpc(receipt,observed),request),/ORDER_NOT_VERIFIED/);
  }
});

test('rejects reverted receipts, wrong networks and invalid order input', async () => {
  await assert.rejects(reconcilePerpsOrderEvidence(rpc({...receipt,status:'reverted'}),request),/RECEIPT_NOT_VERIFIED/);
  await assert.rejects(reconcilePerpsOrderEvidence({...rpc(),getChainId:async()=>1},request),/RECEIPT_WRONG_CHAIN/);
  await assert.rejects(reconcilePerpsOrderEvidence(rpc(),{...request,orderId:0n}),/ORDER_INPUT_INVALID/);
});

test('never infers a fill from an order record marked filled', async () => {
  const proof=await reconcilePerpsOrderEvidence(rpc(receipt,{...order,status:'filled'}),request);
  assert.equal(proof.perpsOrderConfirmed,true);
  assert.equal(proof.perpsFillConfirmed,false);
});
