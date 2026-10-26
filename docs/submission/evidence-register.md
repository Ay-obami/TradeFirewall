# TradeFirewall — submission evidence register

Update the table only when each referenced artifact can be verified. **A missing value means pending, not passed.** Do not place signer secrets in this document.

| Claim | Minimum proof | Status (October 26, 2026) | Evidence reference |
| --- | --- | --- | --- |
| Public source and SDK adapter implementation | Public repository with corresponding source and test coverage | Verified repository exists; offline adapter implemented | https://github.com/Ay-obami/TradeFirewall |
| Automated offline risk checks | Full Node test command and successful output | Verified 101 Node tests on Ubuntu, October 26, 2026 | `npm test`; GitHub Actions for commit `2865440` passed |
| Solidity gate local correctness | Foundry test command and successful output | Verified 14 contract tests locally on Ubuntu, October 26, 2026 | `forge test --root . -vv` |
| Live SDK market reads | Installed official SDK with real Hideki RPC responses and timestamp | Verified read-only on October 26, 2026: chain 50383, 21 markets, sample ZRO market and system config | `node src/dreamdex-live/smoke-read.ts`; fix commit `1857485` |
| Account MarginBank diagnostic | Live account-scoped SDK `getMarginAccount` read | Verified read-only on October 26, 2026: wallet `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D` returned 0 equity, 0 locked/unlocked collateral and 0 active pools; **advisory only** | `node src/account-state/margin-smoke.ts <PUBLIC_WALLET> <MARGIN_BANK>` |
| Indexed perps fill-history access | Genuine SDK `getUserFillsPage` read | Verified read-only on October 26, 2026: target wallet had **0** indexed perps fills, no next cursor, valid dataset generation. This is **not** executed-order proof | `getUserFillsPage(<PUBLIC_WALLET>, { marketType: 'PERP', limit: 50 })` on official SDK 0.32.1 |
| Verified atomic account risk and daily-loss state | Same-block equity, positions, unrealized PnL, and trusted start-of-day baseline | **Pending**: SDK per-call pinning does not expose block identity for merging separate queries | — |
| Wallet gas on Hideki | RPC balance for exact trade/deployment signer, checked immediately before execution | **0 STT** for `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D` during October 26 read-only preflight; recheck before signing | `node scripts/deploy/preflight.ts` with exact wallet and pool; returned `readyForDeployment: false` |
| Operator permission and deployed firewall | Deployment and permission receipts, explorer links, audited signer controls | Pending | — |
| **Real perpetual order** | Successful Hideki transaction and evidence of perps order accepted | **Not yet shown** | — |
| Demo video | Reproducible local demonstration, clearly labeled simulated/live | Pending publication | — |
| X posts | Two or three published post URLs tagging `@DreamDEXSomnia` | Pending | — |
| DoraHacks whitelist | Organizer confirmation for the matching registration email | Pending confirmation | dreamDEX Discord ticket DX-0322; do not imply approved |
| DoraHacks Build submission | Accepted submission URL/timestamp before deadline | Pending | — |

## Live order receipt record (fill only after actual execution)

- Chain ID observed from RPC:
- RPC and SDK version:
- Public signer address:
- Account / market identifier:
- Trade intent and risk-policy decision ID:
- Order type, side, size and quoted price:
- Transaction hash:
- Explorer URL:
- Receipt status and block/time:
- Verified order acceptance / event evidence:
- Pre-submission account and market snapshot reference:
- Post-submission account/order verification:
- Demo clip timestamp:

Keep evidence of blocked or resized intents separate from on-chain order proof: a rejected intent should **not** create a transaction. An offline deterministic test never counts as a live fill.
