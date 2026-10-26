# TradeFirewall — build issues (2026-10-26)

All issues target a gas-free offline deliverable first. No agent may load wallet private keys or create real orders. Working paths are deliberately disjoint for parallel implementation.

## #1 Risk policy engine (parallel)

**Files:** `src/policy/**`, `tests/policy/**`.

Implement a deterministic pure TypeScript evaluation of proposed trade intents against position and account risk. Enforce market allowlist, maximum leverage, order notional, position notional, slippage and daily loss. Return `allow`, `resize`, or `block` with machine-readable reason codes. Reject stale/invalid information and fail closed. Handle decimal precision without floating-point fund arithmetic. Unit tests for agent bypass attempts and boundary values. No network calls.

## #2 dreamDEX SDK adapter and execution boundary (parallel)

**Files:** `src/adapter/**`, `tests/adapter/**`.

Build typed, injectable read and execution interfaces targeting Hideki chain `50383`; provide a guarded order executor that cannot submit an unapproved raw intent, with short-lived bound authorization or server-owned approval token, rejection on state drift, and explicit dry-run implementation. SDK-specific integration must be cleanly isolated, version pinned/documented. Unit tests with fake SDK. No live signing.

## #3 Adversarial simulation and evidence harness (parallel)

**Files:** `src/simulator/**`, `tests/simulator/**`, `fixtures/**`.

Build deterministic offline scenarios: runaway size, stale oracle, adverse slippage, drawdown breach, replay, conflicting concurrent bot requests, and attempted limits bypass. Output reproducible JSON evidence and metrics. Reuse policy/adapter types only through a separate harness API; do not edit their files.

## #4 Demo dashboard and README story (parallel)

**Files:** `web/**`, `docs/demo/**`.

Create a polished responsive local demonstration of an AI agent proposing trades and firewall independently allowing, resizing, or rejecting them, with audit trail and settings. Browser demo must explicitly say simulated until real hashes exist. Use static fixtures if backend unavailable. No secrets or live trading.

## #5 Integration, on-chain gate, security, and submission (sequential)

**Files:** `contracts/**`, `test/**`, root config/README and CI.

Integrate modules and test build; determine actual dreamDEX operator permissions and whether a smart contract can be the enforced principal without bypass. Do not claim the off-chain gate prevents malicious agents if they retain direct signing privileges. Add fail-closed approval and replay tests. Document deploy, README/X posts, and separate Hideki STT/real-order evidence tasks. Only after real gas, submit a small controlled test trade and record explorer hashes.

## #6 GitHub publishing / DoraHacks readiness (sequential)

Create public repo under `Ay-obami`, publish this issue breakdown as GitHub issues, assign milestones, push reviewed code without secrets, verify whitelist, and submit the MVP before November 1 23:59 UTC. External publication is pending repository creation/authorization.

## #7 Policy-to-executor integration (parallel follow-up)

**Files:** `src/integration/**`, `tests/integration/**`.

Bridge the micro-USD policy engine and single-use guarded executor using explicit, trusted conversions. Demonstrate blocked, resized, and approved dry-run paths without signing or gas. No silent assumptions about market decimals, price feeds, or equity. Reject missing conversion state.

## #8 Verified dreamDEX market-data adapter (gas-free)

**Files:** `src/dreamdex/**`, `tests/dreamdex/**`, `docs/sdk/**`.

Use the official `@somnia-chain/markets-sdk` read APIs for Hideki (`50383`) to construct trustworthy market metadata and snapshots without a wallet signer. Keep version-specific calls isolated and injectable; reject unknown decimals and stale oracle data. Test via deterministic fake client and, if accessible, perform read-only SDK smoke checks. No live orders or gas.
