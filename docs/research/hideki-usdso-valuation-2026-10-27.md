# Hideki USDso valuation boundary — 2026-10-27

This is a **read-only evidence report**, not a permission to trade.

## Observations

- Somnia Hideki chain ID is `50383` (`0xc4cf`).
- Perps MarginBank: `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`.
- Perps collateral: `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`.
- Direct chain reads confirmed `symbol() = USDso` and `decimals() = 18`.
- This collateral is deployed behind an EIP-1967 proxy; the implementation
  observed at block `0x209952a` was
  `0x7bde621181e9889d6824b2cf789856b58b79c29d`.
- No independently authenticated **Hideki USDso/USD fiat price feed** was
  established by the official protocol and oracle documents inspected.
- dreamDEX's competition explicitly treats USDso and STT as paper assets
  without monetary value. Assuming `1 USDso == 1 USD` would be unsupported.

## Exact supported unit conversion

For raw 18-decimal USDso balance `raw`, the nominal six-place number is:

```text
nominalUsdso6 = raw / 1_000_000_000_000
```

This is integer division with truncation; it is **not** an independently
verified US-dollar valuation. Applications must preserve the difference
between `nominalUsdso6` and `usdValue6`.

## Trading-readiness implication

If a strategy is explicitly defined in paper USDso-denominated limits, it
may report its account changes in nominal USDso with accurate source labels,
once **all** external accounting flows and position/funding adjustments are
audited and reconciled. A fiat USD-denominated loss limit needs an additional
trusted USDso/USD feed and cannot simply relabel nominal values as USD.

The present TradeFirewall accounting report has not independently proven
every flow affecting account equity and remains `riskExecutable: false`.
Funding or the mere presence of an oracle-backed **market** mark does not
remove that accounting blocker. The index price's timestamp is not a
timestamp for the EMA mark itself.

## Primary references

- [dreamDEX Perps developer reference](https://app.dreamdex.io/docs/developers/perps-testnet)
- [dreamDEX Perps paper-trading overview](https://app.testnet.dreamdex.io/docs/trading/perps-testnet)
- [Official Perps Arena rules](https://app.testnet.dreamdex.io/competition)
- [Somnia Protofire oracle reference](https://docs.somnia.network/developer/building-dapps/oracles/protofire-price-feeds)
- [Somnia Markets network/price-feed reference](https://prd.smk.somnia.host/docs/typescript/reference/networks-and-endpoints)
