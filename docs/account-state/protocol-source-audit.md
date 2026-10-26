# Authoritative dreamDEX account-data sources (SDK 0.32.1)

This document identifies read-only, documented account data sources that are more authoritative than indexer-only portfolio activity. It does **not** establish a TradeFirewall-approved, single-block account-risk snapshot by itself.

## Verified documented SDK methods

- [`client.getMarginAccount(marginBank, account)`](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/SomniaMarketsClient) reads cross-margin state from the on-chain MarginBank. The SDK samples a chain head once and pins its *internal* component reads to that block. Returned fields in [`MarginAccount`](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/MarginAccount): `unlockedCollateralBalance` (signed `bigint`), `lockedCollateral`, `activePerpPools`, `equity` (signed `bigint`), `withdrawable`, `imReq`, `mmReq`, `cmReq`, and `marginStatus`. Equity includes unrealized PnL and pending funding.
- `client.getAccountHealth(marginBank, account)` returns the chain-pinned account-level equity/initial/maintenance/closeout health subset.
- `client.getPerpPosition({ marginBank, account, pool })` returns the signed position in one MarginBank pool; the exact reference type must be taken from the pinned SDK version before calling.
- `client.getPerpPositionAnalytics(ref)` returns marked PnL, funding, notional and per-position margin requirements. Its two internal reads are pinned together; stale-mark rows report `priceable: false`.
- `client.listPerpPositionAnalytics({ marginBank, account })` reads every *active* position using `1 + 2n` chain calls pinned to one sampled block **within that SDK method**.
- `client.getPerpPortfolio(account)` and `client.listPerpPositions(account)` are **indexer** activity/history views. The latter is not mark-to-market and cannot supply funding-sensitive fields; zero rows does not prove a flat on-chain account.

## Important snapshot limitation

`MarginAccount` itself does **not** expose a `blockNumber` or block hash. Although `getMarginAccount` and `listPerpPositionAnalytics` each pin their *internal* calls, invoking them separately may sample **different block heads**. Neither response proves shared-block identity. An integration must not sum account equity from one response with positions or performance from another and label that combination atomic. Use a verified block-pinned ABI/RPC reader (or a method that returns a verifiable shared block reference), otherwise fail closed for strict risk authorization.

No documented method above directly supplies TradeFirewall's independent **daily realized PnL** or a trusted start-of-day equity baseline. Daily-loss limits must stay fail-closed until those are sourced and verified separately.

## Recommended integration and checks

1. Use `getMarginAccount` to display *advisory* live account health, validating RPC chain ID `50383`, address identity, bigint signs and the exact MarginBank.
2. Use `listPerpPositionAnalytics` to display *advisory* active exposure and per-position analytics; reject stale or unpriceable marks.
3. For automated order admission, require independently verified same-block account + positions + daily PnL, or refuse execution. Do not treat an indexer response, zero rows, or an unverified mock as live collateral.
4. Record SDK version, RPC endpoint, observed block metadata (when independently available), account address, selected bank and time for reproducibility. Never include wallet recovery material.

Sources: [official dreamDEX testnet developer guide](https://app.testnet.dreamdex.io/docs/developers/perps-testnet), [official `SomniaMarketsClient` SDK reference](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/SomniaMarketsClient), [official `MarginAccount` interface](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/MarginAccount).
