# README copy — use after integration

> **Editorial note:** This is a draft for the repository's top-level README. Keep the status labels accurate and replace placeholders only with verified artifacts.

# TradeFirewall — Independent Risk Guard for Automated Perps Trading

TradeFirewall sits between an AI trading agent (or conventional external bot) and the dreamDEX perpetual-futures order execution route. It evaluates proposed trades against the trader's preconfigured constraints, then **allows, reduces, or blocks** the requested action. The user defines the constraints; the bot does not get to silently rewrite them.

## Who it helps

Automated traders who want to use bots and agents without giving a strategy unchecked discretion over position size, leverage, slippage, or loss exposure.

## Core experience

1. The bot proposes a trade intent.
2. The risk engine checks market permission, leverage, order notional, position limits, allowable slippage, loss budget, and freshness of input state.
3. The result is `allow`, `resize`, or `block`, accompanied by machine-readable reasons and an audit entry.
4. A guarded execution adapter is intended to submit only a freshly approved intent using credentials the bot cannot access directly.

## Security boundary

**Important:** an off-chain firewall does not independently constrain a bot that retains direct access to the unrestricted trading signer. The enforceable setup puts signing/operator credentials behind TradeFirewall, with protected policies and replay/state-drift checks. Any on-chain contract enforcement is separately experimental until verified against dreamDEX contract authorization mechanics.

## Development status

Currently, the demo runs using **simulated orders**, and its outputs must not be confused with actual exchange fills or live on-chain protection. The funded integration milestone will demonstrate real perpetual-futures orders on dreamDEX's Somnia Hideki testnet (chain ID `50383`) and link the transaction receipts here.

## Run locally

Install Node.js 24 (or supported minimum listed in `package.json`). Run `npm test` from the repository root. Open the local demo according to `web/` instructions. Any production credential must be provided only to the guarded executor at runtime; never commit a `.env` file.

## Evidence

- Offline tests: [add exact test command/output once verified]
- Deterministic simulator: [add exact command/JSON output once verified]
- Live Hideki testnet order: **pending STT funding and SDK integration**
- Public explorer receipts: **pending**
- Demo: [add working recording/link]

## X posts

1. [Post 1 URL — add after publication]
2. [Post 2 URL — add after publication]
3. [Post 3 URL — optional; add after publication]

Developed for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail). Not financial advice.
