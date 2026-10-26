# Read-only PERP fill-index correlation

The pinned official SDK (`@somnia-chain/markets-sdk@0.32.1`) exposes
`markets.client.getUserFillsPage(account, { marketType: 'PERP', limit: 50 })`
with paginated `FillRow` records and a dataset-generation marker. The source
also exposes `listPerpPositionChangesForFills(account, page.fills)`; its
position-change output is not required or assumed here.

`verifyPerpsFillsFromSdk` accepts that read-only SDK method and an independent
RPC receipt reader. It:

- Verifies Hideki (`50383`) and the mined transaction's operator/sender.
- Queries fills for the *beneficial trading account*, which may differ from
  the linked bot operator that sent the transaction.
- Requires an exact transaction hash, pool, order ID and matching maker/taker
  account seat, with positive raw quantity/price and receipt-matched block.
- Rejects malformed rows, duplicate log indexes, reused cursors, and dataset
  generations changing between pages; never pretends a partial page scan is
  exhaustive.

The output intentionally distinguishes `indexerFillMatched: true` from
`perpsFillConfirmed: false`. Indexed data correlated with a mined receipt is
stronger than receipt-only evidence, but it is **not an independent decoder of
PerpPool on-chain fill logs**. The next acceptance step is confirming the
exact PerpPool ABI/events and matching those logs with the indexed record.

No keys, signing, gas or order submission are involved. Tests use controlled
fake SDK/RPC responses; live owner-specific fill evidence awaits a real order
for TradeFirewall and independent event validation.
