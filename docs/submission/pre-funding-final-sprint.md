# TradeFirewall — pre-funding integration acceptance

This is a **review checklist**, not evidence that a live order has been executed. A funded Hideki account is still needed for deployment, operator grant, submitted order and reconciled fill. Never describe offline decisions, receipts or nonces as real chain activity.

## Release acceptance gates

| Area | Minimum evidence | Refusal condition |
| --- | --- | --- |
| Risk-data reader | Independently attested, same-block owner/pool/contract identities, mark freshness and authenticated source | Any unverified price, policy, PnL or unsupported pinned RPC read |
| Equity and flow accounting | Starting/ending account evidence, complete transaction domains, verified net external transfers, fees, funding and liquidation semantics | Missing or ambiguous domains; internal margin movements counted as external profit/loss |
| Wallet UX | Real wallet address and chain displayed; clear read-only account state; unsigned payload inspectable | Mismatched chain/account; simulated data presented as authenticated wallet state |
| Gate permissions | Local contract tests for correct pool/selector, direct-bot denial, pause, revocation and expiry | Bot bypass, stale intent or ambiguous operator registration |
| Transaction lifecycle | Idempotent offline plan, chain nonce distinct from Gate order nonce, failure and replacement cases | Ambiguous broadcast auto-resubmitted, or plan described as a mined tx |
| Web usability | Mobile layout, keyboard navigation, loading/error feedback, honest offline labels | A button appears to execute when it only simulates |
| Operations | Secret scan, deployment variables documented, error health classification, rollback instructions | Credentials shipped to browser, or deployment claimed from config alone |
| Submission | Reproducible local video/demo script, exact commit, test output and claim-to-evidence register | Fabricated chain hashes, unsupported accepted-order or fill claims |

## What funding will **not** automatically solve

1. A deployed gate and a successful on-chain `submit` do not prove an exchange order was accepted or filled. Capture those separately.
2. An equity decrease is not necessarily trading loss. Verify deposits, withdrawals, other account flows and the UTC baseline before enforcing any “daily loss” policy.
3. A nominal conversion from 18-decimal USDso to six digits is not independent evidence of a fiat USD peg.
4. An owner granting a gate permission does not demonstrate direct-bot denial until both exact operator checks are independently observed.
5. A local Foundry fork may be unavailable if the RPC does not expose historical account proofs. Use deterministic mocks for offline tests and live reads for actual deployment evidence; do not pretend mocks are forked execution.

## Funding-day decision

Do not deploy or send the first live order until all critical authoritative data and permission reads have been verified. If the official source for mark, policy or loss remains undocumented/unavailable, the correct state is **BLOCKED**, with the missing dependency named. A good demo may show that refusal accurately; it must not invent successful trades.

Read together with `funding-day-runbook.md`, `evidence-register.md`, and `pre-funding-evidence.md`.
