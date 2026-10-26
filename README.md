# TradeFirewall — Independent Risk Guard for Automated Perps

TradeFirewall allows a trader to set binding limits on **AI trading agents and conventional bots**. Each proposed perpetual-futures order is independently **allowed, resized, or blocked** before the guarded executor can submit it.

**Current status:** working offline proof of concept. **No contract deployed, no live order placed, and no Hideki transaction hash yet.** Browser and CLI examples show simulation, not actual trading.

## What it protects

- Markets, leverage, individual order size, and resulting exposure
- Slippage and daily loss limits
- Stale or malformed account/price snapshots
- Replay attempts, state drift and concurrent requests
- Direct bypass, provided the bot **does not hold an unrestricted signer or separate operator permission**

The pure risk engine uses integer micro-USD arithmetic, not floating-point balances. The execution adapter uses expiring, single-use approvals. An experimental Solidity operator imposes additional market, price, quantity, deadline and pause restrictions, but its live operator authorization remains unverified.

A read-only dreamDEX SDK boundary (`src/dreamdex/read-only.ts`) and a keyless SDK client bootstrap (`src/dreamdex-live/live-read.ts`) are implemented and tested using injected dependencies. The read-only lane validates the observed Hideki chain, market configuration, and sizing constraints; the order lane has guarded, offline-tested SDK request mapping. **The actual SDK package has not been live-smoke-tested against the network here. Verified account risk readings, signed order execution, and transaction receipts are still outstanding.**

## Run locally (Node.js 24 recommended)

```bash
npm test
npm run simulate
python3 -m http.server 8080
```

Open `http://localhost:8080/web/` while the server runs. The demo never connects to a wallet or signs orders. The `simulate` command emits deterministic JSON evidence marked `OFFLINE_SIMULATION`.

## Architecture and limitations

`Untrusted bot → trade intent → risk policy → guarded execution approval → dreamDEX adapter`

In a real deployment the operator/signer is held behind the gate, not by the trading agent. Off-chain checks can be bypassed if the agent retains another unrestricted credential. The Solidity operator prototype (`contracts/TradeFirewallGate.sol`) is a narrower on-chain safety backstop, **not** proof of live dreamDEX integration. See [on-chain limitations](docs/onchain/enforcement.md) and [architecture](docs/architecture.md).

Target exchange: dreamDEX perps, Somnia Hideki testnet (chain ID `50383`). Actual SDK order submission, funding, deployed-operator authorization, and on-chain transactions are outstanding. The Solidity gate's 14 Foundry tests passed on the Ubuntu development laptop on October 26, 2026 using Solidity 0.8.24 with IR optimization. Tests do **not** establish deployment or real exchange permission compatibility.

## Evidence and bounty preparation

- `tests/`: automated offline policy, executor, simulation and UI tests
- `fixtures/`: adversarial proposals
- `docs/issues.md`: independent workstreams and acceptance criteria
- `docs/demo-script.md`: demonstration walkthrough
- `docs/submission/dorahacks-checklist.md`: DoraHacks checklist
- `docs/submission/evidence-register.md`: evidence capture and claim classification
- `docs/submission/x-post-drafts.md`: draft posts (none published)
- `feedback/`: actual reproducible bug reports only; see [the report template](docs/submission/feedback-report-template.md) and [feedback guidance](docs/submission/feedback-guidance.md)

**Live order hashes:** pending testnet STT and SDK integration.

## X posts

1. Pending publication
2. Pending publication
3. Pending publication (optional)

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail). Not financial advice.
