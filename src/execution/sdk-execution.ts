import { DREAMDEX_HIDEKI_CHAIN_ID } from '../adapter/guarded-executor.ts';
import type { PerpsExecutionPort, TradeIntent } from '../adapter/guarded-executor.ts';

type Address = `0x${string}`;

/** Metadata must be obtained from the selected market on the configured chain. */
export interface VerifiedMarketMetadata {
  pool: Address;
  chainId: number;
  tickSize: bigint;
  lotSize: bigint;
  minQuantity: bigint;
  maxQuantity: bigint;
}

export interface PlacePerpOrderParameters {
  pool: Address;
  isBid: boolean;
  price: bigint;
  quantity: bigint;
}

/** Narrow, injectable SDK facade. Never pass wallet keys or a generic signer to this port. */
export interface DreamdexExecutionSdk {
  readonly chainId: number;
  readonly walletAddress: Address;
  readonly trader: {
    placePerpOrder(params: PlacePerpOrderParameters): Promise<unknown>;
  };
  lookupMarket(pool: Address): Promise<VerifiedMarketMetadata | undefined>;
}

export interface DreamdexExecutionPort extends PerpsExecutionPort {
  /** Read-only dry run; validates SDK identity and market units but does not reserve or sign. */
  preview(intent: TradeIntent): Promise<PlacePerpOrderParameters>;
}

const addressPattern = /^0x[\da-f]{40}$/i;
const txHashPattern = /^0x[\da-f]{64}$/i;

function requireValidIdentity(sdk: DreamdexExecutionSdk, intent: TradeIntent): void {
  if (sdk.chainId !== DREAMDEX_HIDEKI_CHAIN_ID) {
    throw new Error('WRONG_CHAIN: dreamDEX testnet orders require Somnia Hideki (50383)');
  }
  if (!addressPattern.test(intent.account) || !addressPattern.test(sdk.walletAddress)
      || sdk.walletAddress.toLowerCase() !== intent.account.toLowerCase()) {
    throw new Error('SIGNER_ACCOUNT_MISMATCH: wallet must own the approved account');
  }
  if (!addressPattern.test(intent.market)) throw new Error('INVALID_ORDER: malformed pool');
}

function requireSupportedIntent(intent: TradeIntent): void {
  // The documented SDK facade exposes only pool/isBid/price/quantity; it does not
  // establish IOC/market semantics. Never silently execute a market request as GTC.
  if (intent.orderType !== 'limit') throw new Error('UNSUPPORTED_ORDER_TYPE: only limit is mapped');
  if (intent.side !== 'buy' && intent.side !== 'sell') throw new Error('INVALID_ORDER: invalid side');
  if (typeof intent.priceRaw !== 'bigint' || typeof intent.quantityRaw !== 'bigint'
      || intent.priceRaw <= 0n || intent.quantityRaw <= 0n) {
    throw new Error('INVALID_ORDER: price and quantity must be positive raw integers');
  }
  if (typeof intent.clientOrderId !== 'string' || intent.clientOrderId.trim().length === 0
      || intent.clientOrderId.length > 128) {
    throw new Error('INVALID_ORDER: clientOrderId is required (max 128 characters)');
  }
}

function requireMarketMetadata(market: VerifiedMarketMetadata | undefined, intent: TradeIntent): asserts market is VerifiedMarketMetadata {
  if (!market || !addressPattern.test(market.pool)
      || market.pool.toLowerCase() !== intent.market.toLowerCase()
      || market.chainId !== DREAMDEX_HIDEKI_CHAIN_ID
      || typeof market.tickSize !== 'bigint' || market.tickSize <= 0n
      || typeof market.lotSize !== 'bigint' || market.lotSize <= 0n
      || typeof market.minQuantity !== 'bigint' || market.minQuantity <= 0n
      || typeof market.maxQuantity !== 'bigint' || market.maxQuantity < market.minQuantity) {
    throw new Error('MARKET_NOT_VERIFIED: missing, inconsistent or untrusted market units');
  }
  if (intent.priceRaw % market.tickSize !== 0n) throw new Error('PRICE_NOT_ON_TICK');
  if (intent.quantityRaw % market.lotSize !== 0n) throw new Error('QUANTITY_NOT_ON_LOT');
  if (intent.quantityRaw < market.minQuantity || intent.quantityRaw > market.maxQuantity) {
    throw new Error('QUANTITY_OUT_OF_RANGE');
  }
}

/**
 * A transaction-placement port for the already-approved, guarded order path.
 * This is NOT a policy engine: caller must use createGuardedExecutor and its
 * explicit approval flow before invoking submitOrder.
 */
export function createDreamdexExecutionPort(sdk: DreamdexExecutionSdk): DreamdexExecutionPort {
  // One-use reservation is deliberately conservative. A failed SDK call may have
  // broadcast already; do not automatically retry without chain reconciliation.
  const reserved = new Set<string>();

  async function preview(intent: TradeIntent): Promise<PlacePerpOrderParameters> {
    requireValidIdentity(sdk, intent);
    requireSupportedIntent(intent);
    const market = await sdk.lookupMarket(intent.market);
    requireMarketMetadata(market, intent);
    return {
      pool: intent.market,
      isBid: intent.side === 'buy',
      price: intent.priceRaw,
      quantity: intent.quantityRaw,
    };
  }

  async function submitOrder(intent: TradeIntent): Promise<{ transactionHash: Address }> {
    const key = `${intent.account.toLowerCase()}:${intent.clientOrderId}`;
    if (reserved.has(key)) throw new Error('DUPLICATE_INTENT: reconcile original submission first');
    const params = await preview(intent);
    // Check again after async market lookup: concurrent requests can reach here.
    if (reserved.has(key)) throw new Error('DUPLICATE_INTENT: reconcile original submission first');
    reserved.add(key);

    let result: unknown;
    try {
      result = await sdk.trader.placePerpOrder(params);
    } catch {
      throw new Error('AMBIGUOUS_BROADCAST: reconcile the original transaction before retrying');
    }
    const transactionHash = typeof result === 'object' && result !== null
      ? (result as { transactionHash?: unknown }).transactionHash : undefined;
    if (typeof transactionHash !== 'string' || !txHashPattern.test(transactionHash)) {
      throw new Error('INVALID_TRANSACTION_HASH: broadcast state unknown; no receipt confirmed');
    }
    return { transactionHash: transactionHash as Address };
  }

  return { preview, submitOrder };
}
