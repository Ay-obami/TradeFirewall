# Account risk: block-pinned source bridge

`createCoherentAccountReaders` in `src/account-state/coherent-reads.ts` bridges a caller-provided authoritative RPC/indexer reader into the exact `readAccountSnapshot` and `readPerformance` interfaces expected by the existing TradeFirewall SDK and policy adapters.

The caller must implement:

1. `readHead()` reporting observed Hideki chain ID (50383), block number, block hash, and block timestamp.
2. `readAccount(account, pool, atBlock)` fetching available margin, signed position, mark, equity (USD6), and daily PnL (USD6) **all at the same numeric block**. An API offering only an unpinned `latest` snapshot is insufficient.
3. `readBlock(number)` returning an independently checked block hash, so a reorganization between reads invalidates the observation.

The bridge rejects wrong networks, malformed addresses, old blocks, missing or negative equity, zero marks, malformed decimal strings, block rewrites and mismatched account/pool/block lookups. It caches verified performance alongside the snapshot rather than fetching a second unpinned financial view. Risk resolution must still verify SDK order-sizing and quote calculations.

## Wiring example

```ts
const bridge = createCoherentAccountReaders({
  readHead: rpcHeadReader,
  readBlock: rpcBlockByNumber,
  readAccount: verifiedPinnedAccountReader,
});

const sdkReads = await createLiveSdkReadOnly({
  sdk, readChainId, readAccountSnapshot: bridge.readAccountSnapshot,
});

const resolveRisk = createMarketRiskResolver({
  readOnly: sdkReads, marketSymbol: 'BTC',
  readPerformance: bridge.readPerformance,
});
```

**Status:** This is a tested integration seam, not a verified production account-data source. The SDK or chain protocol-specific implementation of `verifiedPinnedAccountReader` still needs live Hideki testing. Never invent equity/PnL or substitute mock financial balances in a production execution path. Do not use this bridge for signatures or broadcasting.
