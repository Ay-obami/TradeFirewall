# Accounting coverage audit — 2026-10-27

The new `assessAccountingCoverage` function is a **diagnostic inventory**, not a trading-permission source. It requires caller claims for each economic domain at one account/range, flags missing or contradictory claims, and **always** returns `complete: false`, `riskExecutable: false`, `dailyPnlUsd6: null`, and `dailyLossUsd6: null`. Even fully populated claims lack independent source provenance and verified USD6 valuation.

## Observed boundaries in current source

| Domain | Existing observation | Proof gap |
| --- | --- | --- |
| Deposits / withdrawals | `Deposited`, `DepositedFor`, `Withdrawn` MarginBank logs decoded, categorized as external | Collector scans one MarginBank address; no independently established exhaustive contract/transfer surface |
| Funding | Signed `FundingSettled.payment` decoded and categorized trading | Not an external deposit; absence of events does not prove absence of accrued/unsettled funding in positions |
| Fees / rebates | `FeeCharged`, `BuilderFeeCharged`, `RebatePaid` decoded | Effects on equity and ancillary contract paths are not independently reconciled; insurance portion included in charged amount |
| Liquidation / bad debt | `AutoDeleveraged`, `BadDebtAbsorbed`, `LiquidationOrderPanicked`, `CloseOutMarginSettled` decoded | Settlement can mix counterparties and equity changes; panic event is not an accounting receipt; liquidation completeness unproven |
| Positions | `PositionUpdated` and `PositionTransferred` decoded; SDK analytics can be block-pinned | Position transfer carries collateral plus risk exposure; daily report intentionally rejects this event; unrealized PnL and funding must not be misclassified as external capital |
| Vouchers | `AccountCredited` and `CreditReclaimed` topics decoded | Voucher economic meaning / cross-contract impact not attested; daily report cannot classify these via SDK MarginBank event classification |
| Funded principal | `MainFundedChild` and `FundedPrincipalReturned` decoded | Repayment/principal versus profit needs verified direction/ownership and provenance across contracts |
| Internal collateral | `CollateralLocked` / `CollateralUnlocked` decoded and excluded from total-equity external flow adjustments | Correct exclusion relies on total economic equity capturing both unlocked and locked values without duplicating transfers |
| Cross-account transfers | `CloseOutMarginSettled` classified as external and `PositionTransferred` guarded | Complete receipts/semantics for beneficiary, payer, risk and collateral on either side unproven |

`collectMarginBankLogs` confirms contiguous RPC responses, chain ID, block range, envelope shape and boundary block reorg checks. Its `coverage.complete` **only** proves that collection succeeded under those assumptions. It does not prove that the node served all logs, that the event ABI is exhaustive, that events outside the bank were included, or that all decoded effects can be adjusted as cashflows. The arithmetic reconciliation independently marks its result `UNVERIFIED_RECONCILIATION`.

The accounting inventory checks account, chain, range, hash syntax and cross-domain consistency; ABI/contract/semantics flags; unknown event counts; and unresolved cross-contract receipts. These are **assertions from its input** and must never be promoted to source-verified completion. Hashes are not independently fetched by this function. No token denomination-to-fiat USD6 proof has been established. The existing authoritative daily-loss reader correctly stays unavailable even if provisional raw equity delta is produced.

## Required future proof before any authority promotion

1. Pin an exhaustive deployment and contract-address inventory, ABIs and upgrade histories for the relevant UTC-day block range, including voucher, lending and position-transfer entry points.
2. Independently retrieve and verify receipts/logs for all addresses, reconcile movements account-by-account with block/hash/transaction identities, and fail closed on unknown signatures or effects.
3. Reconcile signed realized and unrealized PnL, accrued/settled funding, fees/rebates, liquidations, debts and position/collateral transfers at both snapshots, with cross-contract conservation checks.
4. Prove collateral token identities, decimals, eligible pricing sources, time/block alignment and an explicit USD6 conversion policy. Confirm that valuation changes themselves are assigned correctly within daily loss.
5. Review this evidence at the authoritative boundary with adversarial tests and documented chain provenance. Until then `riskExecutable` must remain false.
