import { DREAMDEX_HIDEKI_CHAIN_ID } from '../adapter/guarded-executor.ts';

type Address = `0x${string}`;

export interface TransactionReceiptReadPort {
  /** The actual chain observed over RPC, not a caller-supplied config constant. */
  getChainId(): Promise<number>;
  /** Read-only; may return null until a transaction is mined. */
  getTransactionReceipt(hash: Address): Promise<unknown>;
}

export interface ReceiptEvidenceRequest {
  chainId: number;
  account: Address;
  transactionHash: Address;
}

/**
 * A mined transaction is not automatically a filled dreamDEX order.
 * The latter requires separate authenticated event/state reconciliation.
 */
export interface MinedTransactionEvidence {
  kind: 'mined_transaction';
  chainId: typeof DREAMDEX_HIDEKI_CHAIN_ID;
  transactionHash: Address;
  sender: Address;
  destination: Address;
  blockNumber: bigint;
  status: 'success';
  perpsOrderConfirmed: false;
}

const addressPattern = /^0x[\da-f]{40}$/i;
const txHashPattern = /^0x[\da-f]{64}$/i;
const lower = (address: string) => address.toLowerCase();

/**
 * Turns an independently fetched successful receipt into *transaction* evidence.
 * Does not inspect or assert any perps order event, fill, margin, or position.
 */
export async function verifyMinedTransactionEvidence(
  rpc: TransactionReceiptReadPort,
  request: ReceiptEvidenceRequest,
): Promise<MinedTransactionEvidence> {
  if (request.chainId !== DREAMDEX_HIDEKI_CHAIN_ID
      || typeof request.transactionHash !== 'string' || !txHashPattern.test(request.transactionHash)
      || typeof request.account !== 'string' || !addressPattern.test(request.account)) {
    throw new Error('RECEIPT_INPUT_INVALID: expected Hideki chain, address, and 32-byte hash');
  }

  const observedChainId = await rpc.getChainId();
  if (observedChainId !== request.chainId) {
    throw new Error('RECEIPT_WRONG_CHAIN: RPC-reported chain differs from Hideki');
  }

  const raw = await rpc.getTransactionReceipt(request.transactionHash);
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('RECEIPT_NOT_VERIFIED: no mined receipt');
  }
  const receipt = raw as Record<string, unknown>;
  if (typeof receipt.transactionHash !== 'string' || !txHashPattern.test(receipt.transactionHash)) {
    throw new Error('RECEIPT_NOT_VERIFIED: receipt transaction hash invalid');
  }
  if (lower(receipt.transactionHash) !== lower(request.transactionHash)) {
    throw new Error('RECEIPT_HASH_MISMATCH: RPC returned a different transaction');
  }
  if (typeof receipt.from !== 'string' || !addressPattern.test(receipt.from)) {
    throw new Error('RECEIPT_NOT_VERIFIED: receipt sender missing or malformed');
  }
  if (lower(receipt.from) !== lower(request.account)) {
    throw new Error('RECEIPT_SENDER_MISMATCH: receipt is not from the expected trader');
  }
  const blockNumber = receipt.blockNumber;
  if ((receipt.status !== 'success' && receipt.status !== 1 && receipt.status !== 1n)
      || typeof receipt.to !== 'string' || !addressPattern.test(receipt.to)
      || typeof blockNumber !== 'bigint' || blockNumber <= 0n) {
    throw new Error('RECEIPT_NOT_VERIFIED: reverted, unmined, or malformed transaction');
  }

  return {
    kind: 'mined_transaction',
    chainId: DREAMDEX_HIDEKI_CHAIN_ID,
    transactionHash: request.transactionHash,
    sender: request.account,
    destination: receipt.to as Address,
    blockNumber,
    status: 'success',
    perpsOrderConfirmed: false,
  };
}
