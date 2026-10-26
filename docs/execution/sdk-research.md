# dreamDEX perps order-state and fill-evidence research

Date: 2026-10-26. Scope: public official dreamDEX docs and the official Somnia bot-kit README; no wallet, signature, broadcast, or private API access.

## Confirmed public integration surface

- `@somnia-chain/markets-sdk@0.32.1` uses `SomniaMarkets({ chain: hidekiTestnet, indexerUrl, addresses, ... })`. Leave `privateKey` out for read-only use. Hideki chain ID is `50383`; the documented GraphQL indexer is `https://hideki-dev.smk.somnia.host/v1/graphql`.
- `markets.client.listPerpMarkets()` returns perps metadata, including `poolAddress` and `marginBank`.
- `markets.client.getMaxPerpOrderSize({ pool, marginBank, account, isBid, price })` provides the placeable quantity and sizing constraints; it is **not** an order-history or fill query.
- `markets.trader.placePerpOrder({ pool, isBid, price, quantity })` sends an order through a configured signing client; it cannot run gas-free and must remain outside automated read-only verification.
- `markets.client.listPerpOrderRejections(...)` is documented as returning named `OrderRejected` reasons for `placeOrdersFor` batch entries. Its exact input argument and result schema are **not specified by the cited developer page**, so a caller must verify them against installed SDK typings at the pinned version before implementation.

The cited docs do **not** establish a public `client.getPerpOrderById`, `client.listPerpFills`, or `client.getPerpTradeByHash` signature. Do not invent one, assume the spot API is interchangeable with perps, or treat `listPerpOrderRejections` as an authoritative proof of fill.

## Protocol and evidence implications

1. A successful EVM receipt proves that the transaction was mined successfully, **not** that an order was accepted, rested, matched, or filled.
2. A trustworthy perps-order confirmation additionally needs the perps pool/account/order ID mapping from protocol events or independently verifiable contract/indexer state; the current injected `getOrderById` boundary cannot establish its own provenance.
3. A confirmed **fill** needs decoded perps-specific matching/fill events or indexer records with verified order IDs, executed base quantity, price, block and transaction identities. A mere order status of `filled` is insufficient under TradeFirewall's evidence policy.
4. The generic dreamDEX developer **Contracts → Events** page explicitly labels its `OrderPlaced`, `OrderRested`, and `OrderFilled` event topic hashes as **SpotPool / OrderBook Events**. They must **not** be copied into a perps decoder without verifying perps contract ABI and events first.
5. Perps may be traded by a linked bot key that differs from the owner's wallet. Verification must distinguish the transaction sender/operator from the beneficial owner. The official bot-kit specifies that linking grants perps order/cancel/reduce permissions, but does not permit withdrawals.

## Gas-free next steps before live execution

- Inspect pinned SDK `0.32.1` TypeScript declarations on the funded user's Ubuntu installation for exact perps order history/rejection APIs and parameters.
- Obtain verified PerpPool ABI event definitions and build a deterministic receipt-log parser, separately from signing and broadcasting.
- Query public historical perps transactions, if available, and cross-check decoded log data against official indexer rows at a confirmed block. Reject any disagreement and do not treat archival data as a TradeFirewall bot order.
- Keep `perpsFillConfirmed: false` until both authoritative event data and owner/market/order IDs agree.

## Primary references

1. [dreamDEX — Perps on Testnet for Developers](https://app.testnet.dreamdex.io/docs/developers/perps-testnet) (chain/SDK, `listPerpOrderRejections`, raw order calls).
2. [dreamDEX — Contract Events](https://app.testnet.dreamdex.io/docs/developers/contracts/events) (SpotPool events; **not** evidence of perps ABI).
3. [Somnia — dreamDEX Bot Kit, Perps](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/perps.md) (linked operator keys, limitations, dry-run patterns).
