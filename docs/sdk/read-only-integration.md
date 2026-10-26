# dreamDEX Hideki read-only adapter — implementation notes

**Current scope:** offline-tested real *documented SDK method mapping*, using an injectable SDK client. No wallet, credentials, orders or gas are required. The SDK package itself has not been installed in this isolated task, so this is not yet an end-to-end test against the live SDK runtime.

## Verified official API (`@somnia-chain/markets-sdk@0.32.1`)

Per [dreamDEX Perps on Testnet for Developers](https://app.testnet.dreamdex.io/docs/developers/perps-testnet):

- Hideki chain ID `50383`, RPC `https://api.hideki2.infra.testnet.somnia.network`, SDK chain export `hidekiTestnet`.
- Instantiate `new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: 'https://hideki-dev.smk.somnia.host/v1/graphql', addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES })` without `privateKey` for read-only use.
- `markets.client.listPerpMarkets()` yields `poolAddress`, `marginBank`, `quoteToken`, `baseSymbol`, `baseDecimals`, `quoteDecimals` plus market parameters.
- `markets.client.getPerpSystemConfig(marginBank)` identifies the collateral token; verify against the market's quote token.
- `markets.client.getMaxPerpOrderSize({ pool, marginBank, account, isBid, price })` returns `priceable`, `placeable`, `maxQuantity` and `limitedBy`. `priceable=false` means the mark is stale and TradeFirewall must block.

`createDreamdexReadOnly` maps those methods to `getMarket(symbol)` and `quote(symbol, account, side, humanPrice, humanQuantity)`. It checks price tick, quantity lot/minimum, exact base/quote decimals (including NEAR's 24 base decimals), validates the chain ID and rejects unpriceable or oversized orders. All fund arithmetic uses `bigint`.

## Account snapshot source remains a mandatory integration dependency

The official developer page does not expose one documented SDK method that returns every field required by the firewall (`markPriceRaw`, `availableMarginRaw`, signed position size, a consistent block/snapshot identifier, and observation timestamp). The adapter **does not invent an SDK method**. Its `readAccountSnapshot` injection must be provided by a real on-chain/indexer reader with verified account semantics, block coherence and RPC chain ID. Supplying a fake/constant `chainId=50383` would **not** independently verify the network. Likewise, wall-clock freshness alone cannot prove an oracle's on-chain mark remains valid. Before enabling submissions, pair account reads with a live SDK `getMaxPerpOrderSize` mark-priceability check and revalidate at execution time.

The currently exposed `readSnapshot` is therefore a validation boundary, not a complete independent live account fetch. User funds must never be exposed to a bot retaining direct signer privileges.

## Offline test command

```bash
node tests/dreamdex/read-only.test.ts
```

Live read-only smoke testing, real SDK shape verification, and execution integration are pending a subsequent integration milestone. No transaction hashes are claimed.
