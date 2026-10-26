# SDK MarginBank account diagnostic (read only)

`createMarginDiagnostic` uses the documented `getMarginAccount(marginBank, account)` method in the official Somnia Markets SDK after independently verifying RPC chain ID `50383`.

This is real contract-derived data, not a fabricated account balance. A successful response supplies the SDK's unlocked/locked collateral, equity, withdrawable funds, active perp pools, and IM/MM/CM requirements. Numeric values remain raw `bigint`s; no assumed decimals or USD conversion are applied.

**Safety boundary:** The SDK pins one `getMarginAccount` call internally, but the returned record has no observed block height/hash. The result is therefore `ADVISORY_ONLY`, `riskExecutable:false`. Combining it with a separate position analytics or PnL call does **not** establish one atomic risk snapshot. TradeFirewall must continue rejecting live automated orders without a verified same-block risk reader and a trusted daily-loss baseline.

The diagnostic requires an injected initialized SDK client and a chain ID reader. Never embed a mnemonic or private key. The diagnostic performs no transaction submission or signing.

For a public-address smoke test after installing the documented SDK, run:

```bash
node src/account-state/margin-smoke.ts \
  0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D \
  0x478769E1177C0773c43A593DCCc4Ad15F15F1394
```

The output explicitly sets `riskExecutable:false`; a successful query does not certify cross-call block consistency or daily PnL. Output quantities are unscaled raw integers, not assumed USD values.

Reference: [Official Somnia Markets SDK `getMarginAccount`](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/SomniaMarketsClient).
