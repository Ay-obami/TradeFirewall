# dreamDEX SDK execution boundary

`src/execution/sdk-execution.ts` provides a narrow, injectable transaction-placement port to connect TradeFirewall's existing `createGuardedExecutor` approval flow to the dreamDEX Perps SDK. It **does not** create approvals, custody keys, or submit anything on its own. No live orders have been placed in this implementation.

## Integration boundary

1. Configure a trusted dreamDEX SDK instance for **Somnia Hideki testnet, chain 50383**, outside the agent. Its wallet must be the account being approved. Do not give the agent a private key, wallet provider, arbitrary calldata capability, or direct SDK trader handle.
2. Adapt the actual SDK's `trader.placePerpOrder` method and verified market information to `DreamdexExecutionSdk`. The SDK documentation shows `{ pool, isBid, price, quantity }` with integer values in the market's raw quote/base units; don't convert these to JavaScript floating point.
3. Read the market's chain, tick size, lot size, and min/max order quantity from the **selected market's trusted network metadata**. `lookupMarket` is mandatory and checked on every request; never provide guessed or hardcoded production numbers.
4. Call `createDreamdexExecutionPort(sdkFacade)`, then inject `port.submitOrder` as the **only** `submitOrder` callback in `createGuardedExecutor`. Only the guarded executor should invoke it after human approval and its state-drift/policy checks.
5. Optionally call `port.preview(intent)` for a non-signing dry run. It validates and maps parameters but doesn't reserve the client order ID or issue a transaction.

## Fail-closed rules

- Wrong chain, signing account mismatch, unrecognized pool, missing/invalid market metadata, off-tick price, off-lot quantity, zero/negative amounts, and out-of-range quantity all fail before SDK placement.
- Only explicit `limit` orders map to the documented method. `market` is rejected until the SDK's market/IOC and slippage semantics are verified and separately reviewed. The current adapter doesn't support stop, reduce-only, FOK, post-only, delegation, or link-a-bot operator placement.
- Every `(account, clientOrderId)` can be submitted **once per process**. A successful placement, SDK timeout, network error, or invalid SDK response reserves the ID and prevents a blind resend. This memory-only guard is **not sufficient** for multi-process or crash-safe operation; a durable submission journal keyed by wallet and order ID plus on-chain reconciliation is required before production deployment.
- A syntactically valid transaction hash is **not** a mined receipt, confirmed fill, finality, or proof of P&L. Monitor the transaction receipt and protocol order state separately. Never report a trade as executed based solely on an SDK response.
- SDK errors are deliberately summarized as `AMBIGUOUS_BROADCAST`; caller must reconcile on chain before any new transaction is attempted. Error messages must not contain account secrets.

## Testing and readiness

Run `node tests/execution/sdk-execution.test.ts` for the mock-SDK suite. It covers exact field mapping, dry-run, chain/account binding, market-unit constraints, unsupported orders, duplicate suppression, ambiguous failure, and hash validation.

This component's status is **mock-tested adapter**, not live network integration. Before a bounty MVP can truthfully claim live orders, the trusted facade must be wired to an official SDK instance, tested with paper funds on Hideki, and accompanied by transaction hashes and receipts. Do not commit private keys or live credentials to the repository.
