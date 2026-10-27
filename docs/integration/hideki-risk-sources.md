# Hideki production risk sources (read-only, fail-closed)

`createHidekiRiskSources({rpc, gateAddress, botAddress, expectedGateRuntimeCode, expectedPoolRuntimeCode})` supplies the interface expected by `createVerifiedRiskReadiness`, but it **cannot currently issue live risk readiness**. The two expected values must be independently verified, complete **runtime bytecode** for the precise deployed gate and pool implementations (including compiler metadata and any deployed immutables). No bytecode default is provided. The adapter intentionally rejects three missing authorities:

| Reader | State | Reason |
| --- | --- | --- |
| `readBlock` | Implemented | Confirms chain `50383`, exact block number/hash and on-chain timestamp. |
| `readGate` | Implemented | Uses the gate/PerpPool selectors already documented in `src/execution/gate-chain-state.ts`; requires exact attested gate and pool runtime bytecode, gate bot/owner, pause, market config, operator permission and absence of direct bot authorization. |
| `readPrice` | **Fails closed** | No verified Hideki on-chain EMA mark getter ABI and mark timestamp/validity semantics are established. A general index oracle timestamp is not a mark freshness proof. |
| `readPolicy` | **Fails closed** | No immutable, independently authenticated risk-policy version and daily-loss limit source is established for the account/market/block. A caller-created JSON snapshot is not proof. |
| `readDailyLoss` | **Fails closed** | Complete equity, daily external-flow semantics, funding/position accounting and USDso/USD valuation remain unverified. No zero defaults or fabricated USD6 amounts. |

## Block consistency

Contract reads use EIP-1898 `{blockHash,requireCanonical:true}` on `eth_call` and `eth_getCode`. The adapter checks RPC `eth_chainId`, exact numbered block identity and timestamp before/after gate reads, validates the snapshot identifier, and rejects wall-clock stale scopes (default 3,000 ms). RPC nodes that do not support EIP-1898 fail closed; this must not be replaced with `latest` or an unchecked numeric block tag. Empty, malformed, all-zero or omitted expected runtime code is rejected; a difference in even one byte of fetched runtime code denies gate proof.

The required expected bytecode must originate from an independent deployed-bytecode/source attestation, not from an unaudited `eth_getCode` snapshot copied into configuration. A nonempty `eth_getCode` response alone demonstrates deployment, **not** verified contract identity. Selectors inherited from the local gate reader must also be checked against the verified deployed ABI before production trust. Proxy-backed contracts require independently vetted implementation and proxy semantics beyond matching the proxy runtime alone. These caveats are additional reasons the current composite reader is intentionally non-executable.

The adapter has no signing API and invokes no transaction methods. Its gate-state output is evidence only: the existing verifier still denies executable proof until all five readers independently succeed. To unlock price/policy/daily loss, obtain independently verified deployed contract ABI/source and account economics evidence, then audit corresponding new readers. Do not wire anonymous strategy callbacks or estimated PnL as trusted production sources.

## Official-source investigation (2026-10-27)

The [official Hideki perps developer page](https://app.dreamdex.io/docs/developers/perps-testnet) specifies network `50383`, the perps MarginBank and OperatorPermissionsRegistry addresses, and the SDK `getMaxPerpOrderSize` **priceable** flag. It states that `priceable: false` means a stale market mark and that quantities/quotes use market-specific decimals; it does **not** specify a complete block-pinnable `markPriceRaw` getter, ABI selector, timestamp, or result envelope. A boolean indicating priceability is insufficient to attest a specific raw mark number.

The [official contract-function documentation](https://app.dreamdex.io/docs/developers/contracts/functions) and [mark event documentation](https://app.dreamdex.io/docs/developers/contracts/events) describe a **SpotPool** EMA-smoothed midpoint and `MarkPriceUpdated` event. These are explicitly spot-market surfaces, not a verified perps pool mark getter on Hideki. Transplanting those selectors or events into `readPrice` would conflate two different contracts and fail provenance review.

The [official perps trading overview](https://app.testnet.dreamdex.io/docs/trading/perps-testnet) describes paper USDso margin, funding and testnet risk, but does not define an auditable user-configured firewall policy contract or a complete historical USD-denominated account equity/daily-loss accounting oracle. The [USDso valuation report](../research/hideki-usdso-valuation-2026-10-27.md) independently notes that USDso/USD fiat value and accounting-flow completeness are not established. Neither should be synthesized from margin balance, nominal USDso amounts or an SDK position analytics aggregate.

**Engineering decision:** The confirmed source evidence advances chain/gate preflight only. `readPrice`, `readPolicy` and `readDailyLoss` remain explicit errors. No live readiness proof can be minted from this adapter until deployed perps getter ABI, mark age semantics, independently authoritative risk-policy storage, complete accounting, and USD denomination are established and tested against exact block identity.
