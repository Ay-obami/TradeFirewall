/**
 * Keyless Hideki perps SDK read adapter.
 *
 * The SDK methods below are the documented methods of
 * `@somnia-chain/markets-sdk@0.32.1`. Account risk data is supplied by an
 * independently implemented chain/indexer reader; SDK sizing alone does not
 * provide all fields required by TradeFirewall.
 */

export const HIDEKI_CHAIN_ID = 50383;

type Address = `0x${string}`;

export type DiscoveredPerpMarket = Readonly<{
  baseSymbol: string;
  poolAddress: Address;
  marginBank: Address;
  quoteToken: Address;
  baseDecimals: number;
  quoteDecimals: number;
  tickSize: bigint;
  lotSize: bigint;
  minQuantity: bigint;
}>;

export type AccountRiskSnapshot = Readonly<{
  account: Address;
  market: Address;
  chainId: number;
  blockNumber: bigint;
  observedAtMs: number;
  snapshotId: string;
  availableMarginRaw: bigint;
  currentPositionRaw: bigint;
  markPriceRaw: bigint;
}>;

export type SizingQuote = Readonly<{
  market: DiscoveredPerpMarket;
  priceRaw: bigint;
  quantityRaw: bigint;
  maxQuantityRaw: bigint;
  limitedBy: string;
  priceable: true;
  placeable: true;
}>;

/** Only the SDK methods documented by dreamDEX; no trader or private key. */
export interface DocumentedPerpsSdk {
  client: {
    listPerpMarkets(): Promise<DiscoveredPerpMarket[]>;
    getPerpSystemConfig(marginBank: Address): Promise<{ collateral: Address }>;
    getMaxPerpOrderSize(params: {
      pool: Address;
      marginBank: Address;
      account: Address;
      isBid: boolean;
      price: bigint;
    }): Promise<{
      priceable: boolean;
      placeable: boolean;
      maxQuantity: bigint;
      limitedBy?: string;
    }>;
  };
}

export interface ReadOnlyDependencies {
  sdk: DocumentedPerpsSdk;
  /** Observed actual RPC chain ID, NOT merely a user-selected label. */
  chainId: number;
  readAccountSnapshot(account: Address, pool: Address): Promise<AccountRiskSnapshot>;
  nowMs?: () => number;
  maxAccountAgeMs?: number;
}

function fault(code: string): never {
  throw new Error(code);
}

function decimalScale(decimals: number): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) return fault('INVALID_DECIMALS');
  return 10n ** BigInt(decimals);
}

/** Exact human-readable to raw conversion. Never rounds up or silently truncates. */
export function parseRawUnits(value: string, decimals: number): bigint {
  decimalScale(decimals);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return fault('INVALID_DECIMAL');
  const [integer, fraction = ''] = value.split('.');
  if (fraction.length > decimals) return fault('PRECISION_EXCEEDED');
  return BigInt(integer) * 10n ** BigInt(decimals) + BigInt((fraction.padEnd(decimals, '0')) || '0');
}

export function formatRawUnits(value: bigint, decimals: number): string {
  const scale = decimalScale(decimals);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / scale;
  if (decimals === 0) return `${sign}${whole}`;
  const fractional = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractional ? `${sign}${whole}.${fractional}` : `${sign}${whole}`;
}

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function validAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function createDreamdexReadOnly(deps: ReadOnlyDependencies) {
  const nowMs = deps.nowMs ?? Date.now;
  const maxAccountAgeMs = deps.maxAccountAgeMs ?? 3_000;
  if (!Number.isSafeInteger(maxAccountAgeMs) || maxAccountAgeMs <= 0) fault('INVALID_CONFIGURATION');

  function checkChain(): void {
    if (deps.chainId !== HIDEKI_CHAIN_ID) fault('WRONG_CHAIN');
  }

  async function getMarket(symbol: string): Promise<DiscoveredPerpMarket> {
    checkChain();
    const markets = await deps.sdk.client.listPerpMarkets();
    const matching = markets.find((row) => row.baseSymbol === symbol);
    if (!matching) return fault('MARKET_NOT_FOUND');
    if (![matching.poolAddress, matching.marginBank, matching.quoteToken].every(validAddress)) fault('INVALID_MARKET_ADDRESS');
    decimalScale(matching.baseDecimals);
    decimalScale(matching.quoteDecimals);
    if (matching.tickSize <= 0n || matching.lotSize <= 0n || matching.minQuantity <= 0n) fault('INVALID_MARKET_PARAMETERS');
    const system = await deps.sdk.client.getPerpSystemConfig(matching.marginBank);
    if (!system.collateral || !sameAddress(system.collateral, matching.quoteToken)) fault('COLLATERAL_MISMATCH');
    return Object.freeze({ ...matching });
  }

  async function quote(symbol: string, account: Address, side: 'buy' | 'sell', humanPrice: string, humanQuantity: string): Promise<SizingQuote> {
    if (!validAddress(account)) fault('INVALID_ACCOUNT');
    if (side !== 'buy' && side !== 'sell') fault('INVALID_SIDE');
    const market = await getMarket(symbol);
    const priceRaw = parseRawUnits(humanPrice, market.quoteDecimals);
    const quantityRaw = parseRawUnits(humanQuantity, market.baseDecimals);
    if (priceRaw <= 0n || quantityRaw <= 0n) fault('ZERO_SIZE');
    if (priceRaw % market.tickSize !== 0n) fault('PRICE_TICK_MISMATCH');
    if (quantityRaw < market.minQuantity) fault('MIN_QUANTITY');
    if (quantityRaw % market.lotSize !== 0n) fault('LOT_SIZE_MISMATCH');

    const sizing = await deps.sdk.client.getMaxPerpOrderSize({
      pool: market.poolAddress,
      marginBank: market.marginBank,
      account,
      isBid: side === 'buy',
      price: priceRaw,
    });
    if (!sizing.priceable) fault('STALE_MARK');
    if (!sizing.placeable || quantityRaw > sizing.maxQuantity) fault(`NOT_PLACEABLE:${sizing.limitedBy ?? 'unknown'}`);
    return Object.freeze({
      market, priceRaw, quantityRaw, maxQuantityRaw: sizing.maxQuantity,
      limitedBy: sizing.limitedBy ?? 'none', priceable: true as const, placeable: true as const,
    });
  }

  async function readSnapshot(request: { account: Address; market: Address }): Promise<AccountRiskSnapshot> {
    checkChain();
    if (!validAddress(request.account) || !validAddress(request.market)) fault('INVALID_ACCOUNT_OR_MARKET');
    const snapshot = await deps.readAccountSnapshot(request.account, request.market);
    if (snapshot.chainId !== HIDEKI_CHAIN_ID) fault('WRONG_CHAIN');
    if (!sameAddress(request.account, snapshot.account) || !sameAddress(request.market, snapshot.market)) fault('SNAPSHOT_IDENTITY_MISMATCH');
    if (!Number.isSafeInteger(snapshot.observedAtMs) || snapshot.observedAtMs > nowMs() || nowMs() - snapshot.observedAtMs > maxAccountAgeMs) fault('STALE_ACCOUNT_SNAPSHOT');
    if (snapshot.blockNumber < 0n || snapshot.markPriceRaw <= 0n || snapshot.availableMarginRaw < 0n || !snapshot.snapshotId) fault('INVALID_ACCOUNT_SNAPSHOT');
    return Object.freeze({ ...snapshot });
  }

  return Object.freeze({ getMarket, quote, readSnapshot });
}
