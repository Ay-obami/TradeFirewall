# TradeFirewall — submission evidence register

Update the table only when each referenced artifact can be verified. **A missing value means pending, not passed.** Do not place signer secrets in this document.

| Claim | Minimum proof | Status (October 26, 2026) | Evidence reference |
| --- | --- | --- | --- |
| Public source and SDK adapter implementation | Public repository with corresponding source and test coverage | Verified repository exists; offline adapter implemented | https://github.com/Ay-obami/TradeFirewall |
| Automated offline risk checks | Full Node test command and successful output | Verified 74 Node tests on Ubuntu, October 26, 2026 | `npm test`; CI run must be linked separately |
| Solidity gate local correctness | Foundry test command and successful output | Verified 14 contract tests locally on Ubuntu, October 26, 2026 | `forge test --root . -vv` |
| Live SDK market reads | Installed official SDK with real Hideki RPC responses and timestamp | Pending | — |
| Verified account margin and daily-loss state | Actual account-scoped protocol reads; independently confirmed reference values | Pending | — |
| Wallet gas on Hideki | RPC balance for exact trade/deployment signer, checked immediately before execution | Pending recheck | — |
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
