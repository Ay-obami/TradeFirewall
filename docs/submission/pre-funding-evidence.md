# TradeFirewall pre-funding demo and submission proof

**Status: offline simulation, not a deployed or funded trading system.** This guide is suitable for a technical review before the trading owner and signer have gas/collateral. Evidence of code and policy decisions is not evidence of DreamDEX order acceptance or a fill.

## Five-minute reviewer walkthrough

1. From the repository root run `python3 -m http.server 8080`, then open `http://localhost:8080/web/`. No wallet connection is required.
2. Confirm the visible **SIMULATION MODE** and **NO ON-CHAIN EXECUTION** labels. Click **Run four-case walkthrough**. This loads four synthetic trade intents under the default risk policy and writes each result to the local decision ledger. It does **not** call a signing key, RPC, contract or DreamDEX SDK.
3. Inspect four ledger rows, in execution order:

   | Fixture | Expected decision | Reason | Approved notional |
   | --- | --- | --- | --- |
   | Normal BTC long, 850 USDso | ALLOW | POLICY_PASS | 850 USDso |
   | 3,200 USDso BTC long with 1,500 existing long | RESIZE | ORDER_CAP, POSITION_CAP | 1,000 USDso |
   | ETH short, 47-second price age | BLOCK | STALE_STATE | 0 USDso |
   | SOL long, 340 USDso realized daily loss | BLOCK | DAILY_LOSS_EXCEEDED | 0 USDso |

4. Click individual preset buttons, then **Evaluate trade intent** to test edited policy limits. The guided walkthrough always uses the default baseline; individual evaluations use the visible editable settings. In either path, no trade is sent.
5. Select **Export offline evidence** after an evaluation. Inspect the JSON's intent, limits, decisions, `execution: simulation-only`, `networkExecution: false`, `walletSigned: false`, and empty `transactionHashes`. Attach this as *offline policy evidence*, never a real order receipt.

For reproducibility, capture the local source commit, UTC capture time, Node version, the command `node --test web/tests/*.test.mjs` and the complete passing output. Capture a screenshot of the visible offline labels and ledger without exposing secrets or wallet material. Screenshots are still pending until actually captured, checked and attached.

## Submission evidence gates

| Claim category | Can demonstrate pre-funding? | Claim/evidence discipline |
| --- | --- | --- |
| Source and architecture | Yes | Link source revision and bounded threat model; explain direct-bot bypass must be prevented by real authorization isolation |
| Deterministic policy checks | Yes | Include reproducible passing test output and offline JSON; note simulator's integer-USDso scope and hypothetical account state |
| Read-only Hideki RPC/SDK and account diagnostics | Only if freshly re-run | Retain timestamp, chain ID 50383, address, block and raw outputs; read success is **not** execution permission or live risk readiness |
| On-chain deployment and gate configuration | No, until executed | Require gate address, bytecode, deployment and configuration receipts, corresponding readbacks |
| Operator grant/exclusivity | No, until independently verified | Require exact owner/gate/selector/pool proof that gate is permitted and direct bot route denied |
| Live policy approval | No, while account data incomplete | Require fresh coherent collateral, positions, mark prices, funding and UTC daily-loss baseline, with fail-closed readiness |
| Forwarding a real order | No, until executed | Require `Gate.submit` receipt, event, exact hash, block and active authorization proof |
| Exchange acceptance | No, until reconciled | Require independently observed exchange order ID and status; forwarding transaction alone is insufficient |
| Fill | No, until reconciled | Require fill ID, size, price and query evidence; accepted order is not necessarily filled |
| Hackathon and promotion | Only upon public confirmation | Preserve accepted DoraHacks submission, whitelist confirmation and actual X URLs, not prepared drafts |

## Reviewer-safe copy

> TradeFirewall has an offline browser playground and tested risk-policy workflow showing allowed, resized and rejected hypothetical perpetual trade intents. The browser signs nothing and submits no orders. Deployment, exclusively configured operator permissions, independently verified account risk inputs, accepted orders and fills remain separate milestones requiring on-chain and exchange evidence.

Do not use “live trading,” “deployed risk firewall,” “executed trade,” “filled order,” or “secured all orders” unless each specific claim has matching independent evidence. Consult `docs/submission/evidence-register.md` for the current wider register and `docs/submission/funding-day-runbook.md` for post-funding operations.
