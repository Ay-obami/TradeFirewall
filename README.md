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

A read-only dreamDEX SDK boundary (`src/dreamdex/read-only.ts`) is implemented against an injectable client and tested with fixtures. It validates Hideki network and market metadata, including raw decimals and state freshness. **The actual SDK package has not been live-smoke-tested here; account risk readings and transaction submission still require wiring.**

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

Target exchange: dreamDEX perps, Somnia Hideki testnet (chain ID `50383`). Actual SDK order submission, funding, deployed-operator authorization, and on-chain transactions are outstanding. Existing Solidity tests compiled but have not been executed in Foundry.

## Evidence and bounty preparation

- `tests/`: automated offline policy, executor, simulation and UI tests
- `fixtures/`: adversarial proposals
- `docs/issues.md`: independent workstreams and acceptance criteria
- `docs/demo-script.md`: demonstration walkthrough
- `docs/submission/dorahacks-checklist.md`: DoraHacks checklist
- `docs/submission/x-post-drafts.md`: draft posts (none published)

**Live order hashes:** pending testnet STT and SDK integration.

## X posts

1. Pending publication
2. Pending publication
3. Pending publication (optional)

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail). Not financial advice.
