# Enforcing the TradeFirewall gate in dreamDEX

## Confirmed protocol surface

The official dreamDEX [Link a Bot](https://app.testnet.dreamdex.io/docs/trading/common/link-a-bot) documentation describes owner-approved per-market `placeOrderFor`, `cancelOrderFor` and `reduceOrderFor` capabilities. Its [contract-function documentation](https://app.testnet.dreamdex.io/docs/developers/contracts/functions) specifies `placeOrderFor(owner, isBid, userData, price, quantity, expireTimestampNs, orderType, selfMatchingOption, builder, builderFeeBpsTimes1k)` and says authorization is checked in `OperatorPermissionsRegistry`. [Operators & Session Keys](https://app.testnet.dreamdex.io/docs/trading/spot/operators) explicitly says an approved operator can be a key **or contract**, though that page discusses Spot. Hideki perps developer docs identify the registry at `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a` on chain `50383`.

This supports the proposed contract-based operator architecture, but **Hideki perps contract-operator approval has not been tested live**. The perps UI currently links a bot *address*, and registry compatibility is still a live integration requirement.

## Actual security boundary

1. The user retains custody of the dreamDEX trading wallet (the `owner`).
2. That wallet approves **only the TradeFirewallGate contract** as an operator for `placeOrderFor` on each intended Perps pool. It must not also approve the untrusted bot's EOA for trading.
3. The bot can only call `TradeFirewallGate.submit`. The contract checks permitted caller, pool allowlist, price bounds, per-request raw size cap, unique nonce, deadline and pause status. It **reduces oversized quantity** before calling `placeOrderFor` itself.
4. The existing off-chain policy evaluator and guarded executor handle leverage, daily drawdown, dynamic position exposure, mark-price staleness and slippage. This minimum on-chain backstop does **not** independently validate those dynamic conditions.
5. Revoking the firewall contract's operator approval at the registry disables it. The owner still controls their wallet and may transact directly. The guarantee is **against the automated bot**, not against the wallet owner.

If the bot possesses an unrestricted owner key, or is directly approved in the registry, it can bypass the firewall. Merely calling `evaluateTrade` before the SDK is **not** enforceable against a malicious bot with such privileges.

## Implemented prototype

- `contracts/TradeFirewallGate.sol` — narrow `placeOrderFor` operator, not a deployable product without live operator compatibility and security review.
- `test/contract/TradeFirewallGate.t.sol` — deterministic Solidity test cases for oversized clamping, replay, unauthorized caller, stale deadline, price bounds, pause, and builder fee rejection.
- Compiled both contracts and tests against `solc 0.8.24` successfully on 2026-10-26.
- Foundry/Anvil runtime execution was **not performed** in this environment. Compilation does not prove behavior or integration against a deployed pool.

## Before live deployment

- Install Foundry and run `forge test` (the test harness uses no external dependencies).
- Read the **perps** pool's `isOperatorAuthorized(owner, gate, 0x80054449)` or registry equivalent; don't infer approval from a successful front-end `Link a Bot` flow alone.
- Confirm all actual perps function selectors and the `placeOrderFor` return and payable ABI on deployed Hideki contracts (the public documentation is not an ABI verification).
- Confirm the gate's contract address can receive operator approval for each pool, and **the bot EOA cannot trade directly**.
- Validate decimals, tick/lot sizes, minimum order quantities and gas with a controlled transaction. A raw quantity cap that rounds below a market's lot/minimum will revert instead of placing a smaller order.
- Restrict operator approval scopes (per pool, selector only); fund STT gas for the calling bot and contract call. Never store signing keys in this repository.
- Audit/review for arbitrary-call exposure, reentrancy, faulty market limits, paused/expired behavior, and bypass via replacement/amendment selectors.
- Add dynamic on-chain risk checks or a cryptographically bound approval method if fully on-chain exposure guarantees are required.

**Status:** plausible contract-operator architecture, compiled prototype; not yet a deployed or runtime-verified security control.
