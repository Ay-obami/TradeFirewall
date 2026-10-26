# TradeFirewall — two-minute demo script

## 0:00–0:20 — pain

"A trading bot can follow a strategy perfectly and still expose an account to outsized risk. A faulty model, bad price update, or runaway order size should not have final authority over the trader's account."

## 0:20–0:45 — setup

Open TradeFirewall's policy view. Show the trader's risk limits and the bot's lack of permission to change them. Label the demonstration clearly: **simulated exchange state**.

## 0:45–1:10 — magic moment

Run a legitimate proposal and show `allow`. Run an oversized proposal and show `resize` with the approved amount. Run a stale-market or loss-budget-breaching proposal and show `block` with a human-readable reason. Show the audit trail.

## 1:10–1:35 — adversarial test

Replay a disallowed proposal or attempt to submit an unapproved raw order to the guarded executor. Show rejection independently of the agent's request, emphasizing the trust boundary: the bot must not hold an unrestricted signer.

## 1:35–2:00 — evidence and next milestone

Display deterministic test output and repository references. If real testnet integration is complete, show the exact live Hideki transaction receipt and explain its result. Otherwise say explicitly: "The runtime risk logic and simulator are ready; we have not yet placed live perps orders because the Hideki signer still needs STT gas."

Close: "TradeFirewall is intended for both autonomous AI agents and ordinary trading bots—a trader-defined safety layer between their strategy and execution."

**Recording checklist:** retain full uncut evidence of live transactions, if any; never display seed phrases, encryption identity/private keys, environment files, or passwords; don't suggest simulated fills are mainnet/testnet executions.
