# dreamDEX Perps SDK/API feedback audit — 2026-10-26

Status: **no bounty report filed**. The checks below have not established an independently reproducible dreamDEX defect. Do not move an item into `feedback/` unless its expected behavior, actual response, full environment and reproduction steps have been captured.

## Verified public references

- dreamDEX developer guide: https://app.testnet.dreamdex.io/docs/developers/perps-testnet
- SDK interface reference: https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/SomniaMarketsClient
- Network: Somnia Hideki, chain ID `50383`; RPC `https://api.hideki2.infra.testnet.somnia.network`; official indexer `https://hideki-dev.smk.somnia.host/v1/graphql`.
- SDK version documented by dreamDEX: `@somnia-chain/markets-sdk@0.32.1`.

## Findings and disposition

| Candidate | Evidence / expectation | Disposition |
| --- | --- | --- |
| `getPerpSystemConfig` returned `collateralToken`, but our initial smoke script expected `collateral` | SDK's `PerpSystemConfig` contract includes `collateralToken`; initial checker used the wrong field. Corrected in project commit `1857485`; latest live smoke passed. | **Our adapter bug, not a dreamDEX bug. Do not submit.** |
| No STT faucet accessible for the developer's TradeFirewall wallet | The developer guide specifies gas via Link a Bot / Send it or Top up. A zero-balance wallet and difficulty obtaining gas is insufficient to show faucet malfunction. | Support/product-friction hypothesis. Seek staff guidance; not a reproducible bug report. |
| SDK market listing vs raw factory pool list | Official guide warns factory deployment history can include closed/retired markets. `listPerpMarkets()` is the intended filtered market listing. | Expected behavior. No bug. |
| Per-market base decimals vary | Documentation explicitly warns of decimal ranges (6–24) and names markets. Incorrect 18-decimal quantity construction is client misuse. | Expected behavior. No bug. |
| SDK WebSocket access fails in HTTP-only environment | Docs disclose WebSocket requirement. | Environment limitation, not SDK bug without conflicting promised support. |

## Live read milestone already observed by project integrator

The TradeFirewall integration runner on the authorized Ubuntu laptop reported `LIVE_READ_ONLY`, `chainId:50383`, `marketCount:21`, sample market `ZRO`, and `systemConfigVerified:true` after correcting the local validator. This substantiates a successful market/config read, **not** a defect, funded account, or placed order. Reproduce with `node src/dreamdex-live/smoke-read.ts` after installing official SDK 0.32.1.

## Next high-value test matrix (read-only first)

1. **Market lifecycle consistency:** compare `listPerpMarkets()` with `getPerpSystemConfig()` and current pool status; preserve timestamp, market address, full raw response and whether lifecycle semantics genuinely conflict with docs.
2. **Stale mark and sizing:** on a designated account with sufficient collateral, compare `getMaxPerpOrderSize()` (`priceable`, `placeable`, `maxQuantity`, `limitedBy`) against on-chain mark-update timestamps. An unfunded account returning zero size is not a bug.
3. **Indexer freshness:** compare indexed position/update block with a block-pinned on-chain `getPerpPosition` read. Indexing delay alone is expected; report only an undocumented persistent discrepancy with exact blocks.
4. **Order-state versus transaction receipt:** a successful transaction is not proof of a perps fill. Match relevant order events/state and account before alleging filled/accepted discrepancies.
5. **Documentation claims:** preserve the exact SDK package version, referenced docs revision, command, input, response, expected contract behavior and observation time for any proposed gap.

Do **not** publish security vulnerabilities in this repository. The bounty instructs private disclosure to `security@dreamdex.io`.

## Submission threshold

A candidate becomes a feedback report only when another developer can reproduce it with non-secret inputs: title, `Severity`, `Area`, exact steps, expected/actual output, raw evidence (responses/transaction hash when applicable), SDK version, chain and non-sensitive wallet address. Check for duplicates and distinguish undocumented behavior from known constraints. The first accepted reproducible report is paid; this file itself is not a bounty report.
