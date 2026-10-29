# Funded-day live readiness evidence — 2026-10-29

This document records read-only observations. It is **not** a trading readiness certificate, deployed Gate receipt, or accepted-order claim.

- Chain: Somnia Hideki 50383.
- Trading owner: `0x4da63430901076bF33Ea7E9EA47CCEb6b5578bA1`.
- Bot: `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D`.
- Audited pool: `0x2a1822b02039ddf0e293f3f7243673fc03eaf16c`.
- Bot gas: 17.65 STT (`17650000000000000000` wei).
- Owner cross-margin equity: 1,000 nominal USDso (`1000000000000000000000` raw collateral units), SDK block `36113409`.
- `getPerpState` returned a live mark (`markPriceOk = true`), mark raw `1633865602184000000`, index raw `1633188733173000000`, index timestamp `1793264540`, pool oracle `0x505Ac3BC3A2638c06224AF75e4135871929b9Bc0`.
- Pool-side `isOperatorAuthorized` showed direct bot permission `true` at block `36113347`.
- The reads are individually real but not atomically pinned to one block **across readers**. The policy is not independently attested and the daily-loss calculation does not have exhaustive cross-contract evidence. Therefore `readyForTrading = false`.

## Reproduce safely

```bash
node scripts/deploy/funded-readiness.ts \
  0x4da63430901076bF33Ea7E9EA47CCEb6b5578bA1 \
  0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D \
  0x2a1822b02039ddf0e293f3f7243673fc03eaf16c
```

No signer, secret, transaction request or broadcast is used. The result is time-sensitive and must be re-run immediately before any migration.

## True go/no-go boundary

Before an actual `submit`: independently verify Gate runtime/roles, its exact scoped operator grant, confirmed revocation of direct bot permission, a fresh same-block mark/account/policy proof, complete day PnL and correct USDso units. The trading owner must authorize permission changes; no agent should impersonate or silently grant rights on Wallet 2. Only then attempt a small order and reconcile exchange acceptance/fills separately.
