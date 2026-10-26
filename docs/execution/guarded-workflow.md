# SDK-facing guarded workflow (gas-free preparation)

`createGuardedDreamdexWorkflow` composes three existing boundaries: the
documented dreamDEX limit-order adapter, verified account/risk context, and the
one-time policy approval gate. It does not generate a key or infer collateral.

1. `prepare(intent)` checks the SDK chain, trader account and exact market
   tick/lot constraints **before** evaluating policy and reserving approval.
2. `dryRun(approvalId)` rechecks the frozen account snapshot and market
   metadata, consumes the one-time approval, and returns the precise SDK
   `{ pool, isBid, price, quantity }` arguments. It never calls the SDK signer.
3. `executeLive(approvalId)` throws `LIVE_EXECUTION_DISABLED` by default. Only
   a hosting application that has separately verified funding, operator
   permissions and exclusive signer custody may explicitly opt in using
   `liveEnabled: true`. Even then it rechecks the snapshot, consumes the
   approval, and passes the approved quantity through the SDK adapter.

The function is a composition seam, **not evidence of a live order**. Its
read ports must return genuinely verified block-coherent balances, positions
and PnL; neither voucher eligibility nor an SDK market listing is sufficient.
One-use approvals are in-memory only. Distributed use requires a persistent,
atomically shared reservation store before exposing the live path.

Real execution also requires confirmation against authoritative dreamDEX
order state and separately verified fills. A transaction hash alone does not
prove a perpetual trade was executed.
