import { verifyMinedTransactionEvidence, type TransactionReceiptReadPort } from './receipt-evidence.ts';

type Address = `0x${string}`;

export interface PerpsOrderEvidencePort extends TransactionReceiptReadPort {
  /** Independently fetch a specific order from the exchange's authoritative state at a known block. */
  getOrderById(market: Address, orderId: bigint): Promise<unknown>;
}

export interface OrderEvidenceRequest {
  chainId: number;
  account: Address;
  market: Address;
  orderId: bigint;
  transactionHash: Address;
}

export interface VerifiedOrderStateEvidence {
  kind: 'verified_perps_order_state';
  chainId: 50383;
  transactionHash: Address;
  account: Address;
  market: Address;
  orderId: bigint;
  receiptBlock: bigint;
  orderObservedBlock: bigint;
  orderStatus: 'open' | 'filled' | 'closed' | 'canceled';
  perpsOrderConfirmed: true;
  perpsFillConfirmed: false;
}

const addressPattern = /^0x[0-9a-f]{40}$/i;
const hashPattern = /^0x[0-9a-f]{64}$/i;
const equalHex = (a: string,b: string) => a.toLowerCase()===b.toLowerCase();
const statuses = new Set(['open','filled','closed','canceled']);

/**
 * Receipt confirmation is insufficient. Require a separate authoritative order lookup
 * that binds account, market, ID and originating transaction to the receipt.
 * This adapter trusts the injected order reader to fetch real exchange state: a mock,
 * indexer projection without provenance, or caller-supplied object is NOT chain proof.
 * Even a `filled` status cannot confirm trade fills without execution-event reconciliation.
 */
export async function reconcilePerpsOrderEvidence(
  reader: PerpsOrderEvidencePort,
  request: OrderEvidenceRequest,
): Promise<VerifiedOrderStateEvidence> {
  if (typeof request.market!=='string' || !addressPattern.test(request.market)
    || typeof request.orderId!=='bigint' || request.orderId<=0n
    || typeof request.transactionHash!=='string' || !hashPattern.test(request.transactionHash)
    || typeof request.account!=='string' || !addressPattern.test(request.account)) {
    throw new Error('ORDER_INPUT_INVALID: market, account, orderId and transaction hash required');
  }

  const mined=await verifyMinedTransactionEvidence(reader,request);
  const observed=await reader.getOrderById(request.market,request.orderId);
  if (!observed || typeof observed!=='object') throw new Error('ORDER_NOT_VERIFIED: no exchange order');
  const o=observed as Record<string,unknown>;
  if (typeof o.owner!=='string'||!addressPattern.test(o.owner)||!equalHex(o.owner,request.account)
    || typeof o.market!=='string'||!addressPattern.test(o.market)||!equalHex(o.market,request.market)
    || o.orderId!==request.orderId
    || typeof o.originatingTransactionHash!=='string'||!hashPattern.test(o.originatingTransactionHash)
    || !equalHex(o.originatingTransactionHash,request.transactionHash)
    || typeof o.observedBlock!=='bigint'||o.observedBlock<mined.blockNumber
    || typeof o.status!=='string'||!statuses.has(o.status)) {
    throw new Error('ORDER_NOT_VERIFIED: exchange order does not match successful transaction');
  }
  return {
    kind:'verified_perps_order_state', chainId:50383,
    transactionHash:request.transactionHash, account:request.account, market:request.market,
    orderId:request.orderId, receiptBlock:mined.blockNumber,
    orderObservedBlock:o.observedBlock, orderStatus:o.status as VerifiedOrderStateEvidence['orderStatus'],
    perpsOrderConfirmed:true,perpsFillConfirmed:false,
  };
}
