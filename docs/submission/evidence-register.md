# TradeFirewall — submission evidence register

**Evidence standard:** Record a claim as verified only when the underlying output or transaction can be independently inspected. Code existence, offline simulations, SDK reads, a successful transaction, an accepted order and a fill are distinct proofs. Never paste seeds, private keys, bearer tokens or sensitive wallet exports.

| Claim | Minimum proof | Status as of October 27, 2026 | Evidence reference |
| --- | --- | --- | --- |
| Public implementation | Repo and corresponding source commit | Repo publicly identified; implementation under development | https://github.com/Ay-obami/TradeFirewall |
| Offline policy and adapter tests | `npm test` output against exact commit | Latest parent-session Ubuntu run reported **167 Node tests passed**; retain command output and commit association | `npm test`; latest reported main commit `8282ccf`; verify CI for this commit separately |
| Solidity gate tests | `forge test --root . -vv` output | Latest parent-session Ubuntu run reported **14 Foundry tests passed**; on-chain operator compatibility **not proven** | `forge test --root . -vv` |
| Secret hygiene | Scanner and clean reviewed diff | Must rerun on final commit; not substitute for signing security | `node scripts/security/scan-secrets.mjs` |
| Real SDK read-only market configuration | Official SDK and Hideki RPC response | Previously read-only verified 21 markets, chain 50383 (October 26); this is not trade execution proof | `node src/dreamdex-live/smoke-read.ts` |
| Real wallet MarginBank state | Account-scoped on-chain/SDK response | October 26: target wallet had **0** equity, locked/unlocked collateral and active pools; recheck | `node src/account-state/margin-smoke.ts <PUBLIC_WALLET> <MARGIN_BANK>` |
| Genuine indexed perps fills reader | Raw official indexed fills and cursor | October 26 read returned **0** fills for target wallet; proves read route only | Official SDK `getUserFillsPage` |
| Verified MarginBank ABI and UTC day selector | Bytecode-backed ABI attestation and successful chain call | Live read-only attestation reported; preserve exact code hash and raw output; not yet an authoritative full-day PnL source | `src/account-state/bank-abi-attestation.ts`; MarginBank proxy `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` |
| Economic equity and daily-total-PnL policy | Coherent independently trusted balances, positions, UTC baseline, events, price marks and same-height validation | **Incomplete for live orders.** Provisional report remains `riskExecutable: false`; do not coerce a default or missing value to zero loss | `src/account-state/total-economic-equity.ts`; `src/account-state/daily-total-pnl-report.ts` |
| Money-unit conversion / USD6 prices | Trustworthy price source, precision, timestamp and stale handling | **Incomplete for live orders.** Quote bridge currently `riskExecutable: false` without verified quote provenance | `src/account-state/policy-units.ts` |
| Decoded account economic events | ABI-accurate tested logs and unambiguous historical coverage | Offline decoders include AccountCredited, CreditReclaimed, FundedPrincipalReturned; **not** a complete live event/account PnL history | Account event decoder tests; raw explorer logs required |
| Perps operator permissions | On-chain registry read for exact owner, gate, selector and pool | Read-only inspection code exists, but gate approval and full live permission compatibility not yet verified | `scripts/deploy/operator-permission.ts`; `isOperatorAuthorized(owner,gate,selector)` |
| Guarded bot-to-gate workflow | Fresh independently verified risk approval followed by `Gate.submit`; bot has no direct pool authorization | Offline integration path exists; true live-risk readiness and deployed gate state proof still pending | `src/integration/guarded-gate.ts`; `src/execution/gate-execution.ts` |
| Signer gas and collateral | Fresh balances for signer roles and paper USDso usable by owner | October 26 wallet `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D` showed **0 STT**, **0 usable margin**; stale observation until rechecked | `node scripts/deploy/preflight.ts` and account/owner collateral read |
| Gate deployment | Hideki contract address, bytecode, constructor, tx/block | **Not executed/verified** | — |
| Admin market and gross cap | On-chain `configureMarket`, `setMarketGrossLimit` / allowance receipts and readbacks | **Not executed/verified** | — |
| Operator grant exclusively to gate | Owner authorization receipt; gate **true**, bot direct **false** in registry | **Not executed/verified** | — |
| **Real perp order forwarded** | Bot `Gate.submit` receipt and gate forwarding event | **Not executed/verified**; a receipt alone cannot prove acceptance | — |
| **Exchange order accepted** | Independently queried order ID/state or exchange event | **Not demonstrated** | — |
| **Exchange fill** | Independently queried fill/partial-fill record, size and price | **Not demonstrated**; do not imply a placed order filled | — |
| Real screenshots/demo | Original timestamped live context, safe redactions, clear offline/live labels | Pending | — |
| X posts | Published URLs tagging `@DreamDEXSomnia` | Pending | — |
| DoraHacks whitelist | Organizer email/account confirmation | Pending; existing Discord ticket DX-0322 is not approval | Ticket DX-0322 |
| DoraHacks Build | Accepted submission link/time | Pending | — |

## Funding-day transaction and market evidence (fill only after execution)

| Record | Actual value / link | Check |
| --- | --- | --- |
| UTC time, chain ID, RPC, SDK version and code commit | — | Chain **50383** observed anew |
| Public deployer, admin, trading owner, bot and gate addresses | — | Constructor roles match expected addresses |
| Exact pool, market, collateral account, size/price/gross limits | — | Read live contract configuration |
| Gate deployment hash, block, constructor and runtime bytecode | — | Real explorer receipt + matching code |
| Admin configuration / gross limit / allowance hashes | — | On-chain readbacks match intention |
| Owner operator approval hash and permission registry proof | — | **Gate permitted, bot direct denied** |
| Account total economic equity, UTC loss baseline and trusted price proof | — | Independent `riskExecutable: true`, fresh coherent snapshot |
| Trade intent, approval ID, expiry/nonce, chosen minimum order | — | No bypass around Gate.submit |
| Bot Gate.submit tx hash, receipt status/block and OrderForwarded event | — | Forwarding only, **not** automatically acceptance |
| Exchange order ID, actual acceptance event/state and read time | — | Acceptance independently established |
| Fill IDs, cumulative executed size/price, or explicit no fill | — | Do not confuse accepted with filled |
| After-action pause/revoke status or explicit justification | — | Demonstrate residual permission review |
| Screen captures, video time offsets and explorer URLs | — | No secrets or misleading `OFFLINE_SIMULATION` tags |
| X posts, DoraHacks whitelist confirmation and accepted Build link | — | Publication/account-facing proof separately verified |

Offline rejected or resized risk decisions should not produce a transaction. Do **not** turn “waiting for wallet funding” into “all remaining work complete” until operator grants, trusted risk data, contract state, real order reconciliation and submission evidence are genuinely confirmed.
