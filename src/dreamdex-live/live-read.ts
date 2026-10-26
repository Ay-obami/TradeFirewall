import type { TradeIntent, MarketSnapshot } from '../adapter/guarded-executor.ts';
import type { VerifiedRiskQuote } from '../integration/policy-guard.ts';
import type { AccountRiskSnapshot, DiscoveredPerpMarket } from '../dreamdex/read-only.ts';
import { createDreamdexReadOnly, formatRawUnits, type DocumentedPerpsSdk, type SizingQuote } from '../dreamdex/read-only.ts';

/** Network and indexer documented for dreamDEX perpetual futures on Hideki. */
export const HIDEKI_PERPS_CHAIN_ID = 50383;
export const HIDEKI_PERPS_INDEXER = 'https://hideki-dev.smk.somnia.host/v1/graphql';

export type SdkModule = {
  SomniaMarkets: new (config: Record<string, unknown>) => unknown;
  hidekiTestnet: { id: number };
  SOMNIA_HIDEKI_TESTNET_ADDRESSES: Record<string, unknown>;
};

/**
 * Instantiate the documented SomniaMarkets read client without a signer.
 * Callers supply exports from the installed, pinned SDK and `/chains` module.
 * This avoids mandatory package resolution in deterministic offline tests.
 */
export function bootstrapHidekiReadClient(module: SdkModule): { client: unknown } {
  if (module?.hidekiTestnet?.id !== HIDEKI_PERPS_CHAIN_ID) throw new Error('WRONG_CHAIN');
  if (typeof module.SomniaMarkets !== 'function' || !module.SOMNIA_HIDEKI_TESTNET_ADDRESSES) {
    throw new Error('INVALID_SDK_EXPORTS');
  }
  const sdk = new module.SomniaMarkets({
    chain: module.hidekiTestnet,
    indexerUrl: HIDEKI_PERPS_INDEXER,
    addresses: module.SOMNIA_HIDEKI_TESTNET_ADDRESSES,
    // Deliberately no privateKey: read-only, no authority to send orders.
  }) as { client?: unknown };
  if (!sdk.client) throw new Error('INVALID_SDK_CLIENT');
  return sdk as { client: unknown };
}

/**
 * Fail closed on the chain ID observed by the caller's RPC, not just on a
 * configured SDK chain label. This is the actual SDK-backed read integration;
 * its account data reader remains independently supplied and verified.
 */
export async function createLiveSdkReadOnly(deps: {
  sdk: DocumentedPerpsSdk;
  readChainId(): Promise<number>;
  readAccountSnapshot(account: `0x${string}`, pool: `0x${string}`): Promise<AccountRiskSnapshot>;
  nowMs?: () => number;
  maxAccountAgeMs?: number;
}) {
  const observedChain = await deps.readChainId();
  if (observedChain !== HIDEKI_PERPS_CHAIN_ID) throw new Error('WRONG_CHAIN');
  if (!deps.sdk?.client || typeof deps.sdk.client.listPerpMarkets !== 'function' ||
      typeof deps.sdk.client.getPerpSystemConfig !== 'function' ||
      typeof deps.sdk.client.getMaxPerpOrderSize !== 'function') throw new Error('INVALID_SDK_CLIENT');
  return createDreamdexReadOnly({
    sdk:deps.sdk,
    chainId:observedChain,
    readAccountSnapshot:deps.readAccountSnapshot,
    nowMs:deps.nowMs,
    maxAccountAgeMs:deps.maxAccountAgeMs,
  });
}

type Address = `0x${string}`;
type LiveReadOnly = {
  getMarket(symbol: string): Promise<DiscoveredPerpMarket>;
  readSnapshot(request: { account: Address; market: Address }): Promise<AccountRiskSnapshot>;
  quote(symbol: string, account: Address, side: 'buy' | 'sell', humanPrice: string, humanQuantity: string): Promise<SizingQuote>;
};

type RiskPerformance = { equityUsd6: string; dailyPnlUsd6: string };
export interface LiveRiskDependencies {
  readOnly: LiveReadOnly;
  marketSymbol: string;
  /** Separate verified account reader; SDK sizing is not an equity/PnL oracle. */
  readPerformance(account: Address, pool: Address, block: bigint): Promise<RiskPerformance>;
  nowMs?: () => number;
  maxSnapshotAgeMs?: number;
}

const unsigned = /^(0|[1-9][0-9]*)$/;
const signed = /^-?(0|[1-9][0-9]*)$/;
const addr = /^0x[0-9a-fA-F]{40}$/;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const abs = (a: bigint) => (a < 0n ? -a : a);

function assertValidSnapshot(input: TradeIntent, snapshot: MarketSnapshot, now: number, maxAge: number) {
  if (snapshot.chainId !== HIDEKI_PERPS_CHAIN_ID) throw new Error('WRONG_CHAIN');
  if (input.account.toLowerCase() !== snapshot.account.toLowerCase() || input.market.toLowerCase() !== snapshot.market.toLowerCase()) {
    throw new Error('MARKET_MISMATCH');
  }
  if (!Number.isSafeInteger(snapshot.observedAtMs) || snapshot.observedAtMs > now || now - snapshot.observedAtMs > maxAge) {
    throw new Error('STALE_SNAPSHOT');
  }
  if (snapshot.markPriceRaw <= 0n || snapshot.blockNumber < 0n || !snapshot.snapshotId) throw new Error('INVALID_MARK');
}

function checkedBps(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_BPS');
  return Number(value);
}

/**
 * Create the verified quote/policy-context adapter required by the guarded
 * executor. Decimal conversion and slippage use SDK market metadata and the
 * snapshot's on-chain mark, never an untrusted model-provided USD quote.
 */
export function createMarketRiskResolver(deps: LiveRiskDependencies) {
  const clock = deps.nowMs ?? Date.now;
  const maxAge = deps.maxSnapshotAgeMs ?? 3_000;
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0) throw new Error('INVALID_CONFIGURATION');

  return async (intent: TradeIntent, snapshot: MarketSnapshot): Promise<VerifiedRiskQuote> => {
    const now = clock();
    assertValidSnapshot(intent, snapshot, now, maxAge);
    if (!addr.test(intent.account) || !addr.test(intent.market) || intent.priceRaw <= 0n || intent.quantityRaw <= 0n) {
      throw new Error('INVALID_INTENT');
    }
    const market = await deps.readOnly.getMarket(deps.marketSymbol);
    if (market.poolAddress.toLowerCase() !== intent.market.toLowerCase()) throw new Error('MARKET_MISMATCH');
    if (![market.baseDecimals, market.quoteDecimals].every(x => Number.isSafeInteger(x) && x >= 0 && x <= 36)) {
      throw new Error('INVALID_DECIMALS');
    }
    if (typeof market.lotSize !== 'bigint' || market.lotSize <= 0n || typeof market.minQuantity !== 'bigint' || market.minQuantity <= 0n) {
      throw new Error('INVALID_LOT');
    }
    if (intent.quantityRaw < market.minQuantity || intent.quantityRaw % market.lotSize !== 0n) throw new Error('INVALID_LOT');

    // This is a real SDK client method (`getMaxPerpOrderSize`) through the
    // read-only adapter. It refuses stale marks and an account that cannot
    // place this size; the separate snapshot still drives risk arithmetic.
    const size = await deps.readOnly.quote(
      market.baseSymbol, intent.account, intent.side,
      formatRawUnits(intent.priceRaw, market.quoteDecimals),
      formatRawUnits(intent.quantityRaw, market.baseDecimals),
    );
    if (size.market.poolAddress.toLowerCase() !== market.poolAddress.toLowerCase()) throw new Error('MARKET_MISMATCH');
    if (!size.priceable) throw new Error('STALE_MARK');
    if (!size.placeable || intent.quantityRaw > size.maxQuantityRaw) throw new Error('NOT_PLACEABLE');

    const live = await deps.readOnly.readSnapshot({ account:intent.account, market:intent.market });
    if (live.chainId !== snapshot.chainId || live.blockNumber !== snapshot.blockNumber ||
        live.observedAtMs !== snapshot.observedAtMs || live.snapshotId !== snapshot.snapshotId ||
        live.markPriceRaw !== snapshot.markPriceRaw || live.currentPositionRaw !== snapshot.currentPositionRaw ||
        live.availableMarginRaw !== snapshot.availableMarginRaw) throw new Error('STATE_DRIFT');

    const perf = await deps.readPerformance(intent.account, intent.market, snapshot.blockNumber);
    if (!unsigned.test(perf?.equityUsd6 ?? '') || !signed.test(perf?.dailyPnlUsd6 ?? '') || BigInt(perf.equityUsd6) <= 0n) {
      throw new Error('INVALID_PERFORMANCE');
    }
    const equity = BigInt(perf.equityUsd6);
    const scale = 10n ** BigInt(market.baseDecimals + market.quoteDecimals);
    const mark = snapshot.markPriceRaw;
    const quoteNotionalUsd6 = (quantity: bigint): string => {
      if (typeof quantity !== 'bigint' || quantity <= 0n) throw new Error('INVALID_QUANTITY');
      return ceilDiv(quantity * mark * 1_000_000n, scale).toString();
    };
    const signedPosition = snapshot.currentPositionRaw >= 0n ?
      ceilDiv(snapshot.currentPositionRaw * mark * 1_000_000n, scale) :
      -ceilDiv(-snapshot.currentPositionRaw * mark * 1_000_000n, scale);

    const direction = intent.side === 'buy' ? 1n : intent.side === 'sell' ? -1n : 0n;
    if (direction === 0n) throw new Error('INVALID_SIDE');
    const projectedBase = snapshot.currentPositionRaw + direction * intent.quantityRaw;
    const projectedNotional = ceilDiv(abs(projectedBase) * mark * 1_000_000n, scale);
    const leverageBps = checkedBps(ceilDiv(projectedNotional * 10_000n, equity));
    const adversePrice = direction > 0n ? intent.priceRaw - mark : mark - intent.priceRaw;
    const slippageBps = checkedBps(adversePrice > 0n ? ceilDiv(adversePrice * 10_000n, mark) : 0n);

    return {
      marketSymbol: market.baseSymbol,
      leverageBps,
      slippageBps,
      lotSizeRaw: market.lotSize,
      riskContext: {
        nowMs: now,
        observedAtMs: snapshot.observedAtMs,
        signedPositionUsd6: signedPosition.toString(),
        dailyPnlUsd6: perf.dailyPnlUsd6,
        equityUsd6: perf.equityUsd6,
      },
      quoteNotionalUsd6,
    };
  };
}
