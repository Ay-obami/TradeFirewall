# SDK-backed account eligibility (read-only)

`createVoucherPreflight` calls the documented Markets SDK method
`client.getPerpVoucherEligibility(marginBank, account)` after checking the
observed RPC chain ID is Somnia Hideki (`50383`). It requires an actual boolean
`eligible` response and reports `authority: ADVISORY_ONLY`.

This is useful for diagnosing whether a test account can claim the once-only
paper USDso credit. It **does not** prove a credit was claimed, that a market
permits use of that credit, or that an order is placeable.

The SDK voucher response is not a block-pinned source of equity, free margin,
position exposure or daily realized PnL. It must never be passed to
`createCoherentAccountReaders` as one of those financial values. The verified
risk bridge remains fail-closed until a separately audited on-chain ABI/indexer
reader supplies all its quantities at the exact same observed block.

Reference: [dreamDEX official developer testnet documentation](https://app.testnet.dreamdex.io/docs/developers/perps-testnet).
