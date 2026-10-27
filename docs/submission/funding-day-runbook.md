# TradeFirewall — funding-day integration runbook

**Operational checklist, not an execution record.** Receiving STT or paper USDso does not by itself make live trading safe. No deployment, on-chain permission grant, accepted order, or fill is claimed here. Use Hideki chain ID `50383`; independently confirm every address and ABI before signing. No private keys, seed phrases, or bearer tokens belong in evidence files.

## Gate 0 — non-signing readiness (required before spending gas)

1. Confirm the exact intended perps pool, market ID, MarginBank, chain ID, verified contract implementations and deployed bytecode. Pin the ABI to observed chain code, not just an SDK package name. The previously checked account was `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D` and showed zero STT and zero MarginBank collateral on October 26; re-read current balances.
2. Run `node src/dreamdex-live/smoke-read.ts`, `node src/account-state/margin-smoke.ts <PUBLIC_WALLET> <VERIFIED_MARGIN_BANK>`, and `node scripts/deploy/preflight.ts <PUBLIC_WALLET> <VERIFIED_POOL>`. Record chain, market, account and operator observations. A working SDK call alone does not prove safe trade authorization.
3. Verify independently that the owner can authorize **the deployed gate contract** as perps operator for the exact pool and `placeOrderFor` selector. Check `isOperatorAuthorized(owner,gate,selector)` against the official on-chain registry. A direct bot-to-pool operator grant must remain **false**.
4. Independently validate a coherent risk snapshot: current total economic equity, usable collateral, open positions and exposure, loss since verified UTC-day baseline, and trusted prices / USD6 conversion. Both daily-loss assessment and price conversion must be genuinely `riskExecutable: true` on verified inputs. The provisional daily-PnL report and unverified quote bridge must **not** be used to enable a real order.
5. Run `npm test`, `forge test --root . -vv`, and `node scripts/security/scan-secrets.mjs` on the exact candidate commit. Check corresponding remote CI separately. The policy must reject bad/stale reads, oversize orders and exhausted daily-loss budgets *before* a signer can reach the execution path.

**Stop here if any read or operator compatibility is unverified.** Wallet funding cannot override the risk fail-closed behavior.

## Gate 1 — funded wallet and role review

- Confirm sufficient native STT for each **actual transaction signer** (deployer, admin, owner granting operator permission, and bot submitting the order; roles may share addresses only after explicit review). Estimate worst-case total gas before sending anything.
- Confirm separately that the designated **trading owner** has usable paper USDso collateral in the correct account/pool. STT pays gas; it is not margin collateral. Check organizer restrictions on source/use of paper assets.
- Record public addresses, role ownership, intended pool, target market, chain ID, intended max size and price limits, daily-loss limit and gross cap. Never paste or collect signing secrets.

## Gate 2 — ordered on-chain execution (pending until performed)

| Order | Signer | Transaction or check | Required verification |
| --- | --- | --- | --- |
| 1 | Deployer | Deploy `TradeFirewallGate(admin, bot, tradingOwner)` with reviewed compiled bytecode | Explorer receipt, verified constructor args, runtime bytecode and immutable roles |
| 2 | Admin | Call `configureMarket` for the **exact** pool/market and conservative price/size parameters | Read back allowlist, constraints, pause state and market identity |
| 3 | Admin | Call `setMarketGrossLimit` and provision only narrowly scoped gross allowance as designed | Read back cumulative cap, consumed gross amount and remaining budget. The on-chain gross allowance has **no expiry**; each order has its own expiration and nonce. |
| 4 | Trading owner | Approve **gate address** as operator for the relevant perps pool and order selector | `isOperatorAuthorized(owner, gate, selector) == true`; separately show `isOperatorAuthorized(owner, bot, selector) == false` |
| 5 | Read-only verifier | Recheck bytecode, roles, actual pool, market configuration, gross budget, owner collateral and independently verified risk data | Persist timestamped go/no-go attestation; any mismatch stops execution |
| 6 | Bot | With a fresh, approved risk decision, call **`TradeFirewallGate.submit`** for the smallest acceptable real order | Preserve policy decision ID, calldata, tx hash, gas and receipt; never bypass gate by calling pool directly |
| 7 | Read-only verifier | Query pool/order state and fills independently after confirmation | Separate **tx succeeded**, **order accepted**, **order filled** (including partial/no fill) in the evidence register |
| 8 | Admin/owner | After demonstration, pause/revoke or narrow unused allowances/permissions according to the security plan | Record actual revocation/pause transactions and resulting state, if performed |

Before each signing action, review chain ID, `to`, calldata, value, nonce, gas estimate, maximum fee and exact permissions in the signer wallet. A successful `Gate.submit` transaction may only prove forwarding: verify any emitted `OrderForwarded` event, exchange acceptance/order ID, and subsequent fill(s) separately. **Do not retry an ambiguous broadcast automatically**; first resolve its nonce and receipt.

## Gate 3 — submission evidence and honest claims

1. Record deployment/configuration/grant/revocation hashes and block numbers, pre/post risk snapshots, bot policy decision, exact order, gate transaction receipt, exchange order ID/state and fill records. Screenshots must show the live network and account/order context without displaying secrets.
2. Label rejected, resized and simulated intents `OFFLINE_SIMULATION`; never present them as live acceptance or realized daily-loss protection.
3. Update [`evidence-register.md`](evidence-register.md) with links and observed times. Capture a short real walkthrough only after the chain/exchange reconciliation is complete.
4. Confirm DoraHacks email whitelist, publish the required truthful X posts tagging `@DreamDEXSomnia`, and verify the actual DoraHacks Build submission before the stated deadline (previously recorded as **November 1, 2026, 23:59 UTC**; reconfirm with organizers).

The remaining funded-account work is **not only gas** if the operator contract interface, independently trusted risk/PnL source, or executable price attestation still fails verification. Record those as blockers rather than claiming completion.
