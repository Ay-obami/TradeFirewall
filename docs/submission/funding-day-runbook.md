# TradeFirewall — funding-day integration runbook

This is a **future execution checklist**, not proof that the wallet is funded, the firewall deployed, or a perp order placed. Do not execute any signing step until its destination, calldata, wallet and permission scope have been reviewed by the owner.

## Read-only gate — run first

1. Verify the exact wallet address and which account holds usable paper USDso. The previously checked TradeFirewall wallet is `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D`; it returned 0 STT **and 0 MarginBank collateral/equity** on October 26. Both gas and usable trading collateral are prerequisites. Never import a production seed or paste a private key in a terminal or support ticket.
2. Verify `cast chain-id --rpc-url https://api.hideki2.infra.testnet.somnia.network` returns `50383`.
3. Install the documented official SDK version in the local checkout and run `node src/dreamdex-live/smoke-read.ts`. This is **market/configuration read proof only**.
   Run `node src/account-state/margin-smoke.ts <PUBLIC_WALLET_ADDRESS> <VERIFIED_MARGIN_BANK>` for a genuine **advisory-only** account read. The reported `riskExecutable: false` must not be overridden just because the API call succeeds.
4. Run `node scripts/deploy/preflight.ts <PUBLIC_WALLET_ADDRESS> <VERIFIED_POOL_ADDRESS>`. If it exits nonzero, stop; a zero gas balance must not be bypassed. A green preflight does **not** prove operator approval or live trading safety.
5. Run `npm test`, `forge test --root . -vv`, and `node scripts/security/scan-secrets.mjs`; record any failures. Confirm CI is green for the commit being demonstrated.

## Signing gate — not yet authorized or complete

The following steps **remain pending** even after STT arrives:

1. Resolve official perps operator permissions and verify whether the TradeFirewall contract itself can be an approved operator on the intended account. Inspect the exact contract ABI, supported selectors, roles, token approval implications and signer limitations. The current gate is an experimental defense-in-depth contract, not a verified operator for dreamDEX.
2. Obtain a real, coherent, account-scoped collateral/equity/position/daily-PnL reader. Voucher eligibility and market configuration are advisory data; they must not stand in for equity or loss calculations.
3. Review compiled deployment bytecode, constructor arguments, wallet nonce, gas estimate, chain ID, destination and maximum transaction cost. Confirm the private key stays exclusively under wallet-owner control.
4. If and only if all permission and risk gates are verified, deploy/authorize using the narrowest approved permissions, then place the smallest suitable real order via the guarded adapter. Avoid using extra bounty USDso in a Perps Arena account if disallowed by the organizers.
5. Reconcile the transaction receipt **and** the exchange order record using independent reads. Transaction success alone does not prove a perps order was accepted or filled.

## Evidence and submission

- Save the explorer transaction URL, chain ID, wallet, order ID, block number and time, market, intent, preflight snapshot, policy decision, exact order response and reconciliation outcome. Exclude signer secrets and bearer tokens.
- Film or capture the real accepted order separately from simulated rejected/resized orders. Keep the demo's `OFFLINE_SIMULATION` export labeled truthfully.
- Update [`evidence-register.md`](evidence-register.md); publish two or three accurate X posts tagging `@DreamDEXSomnia`; submit the DoraHacks Build only once the approved email is whitelisted.
- Confirm submission appears successfully on DoraHacks before **November 1, 2026, 23:59 UTC**.
