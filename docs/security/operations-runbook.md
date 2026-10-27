# TradeFirewall testnet operations: health, incident logs, rollback

**Scope:** Somnia Hideki 50383, offline-first MVP. This document does not authorize funding, signing, deployment, operator grants or order submission. A healthy RPC is only a connectivity observation, **never** a green light to trade.

## Read-only health check

```bash
TRADEFIREWALL_PUBLIC_RPC_URL=https://your-approved-public-hideki-rpc.example \
  node scripts/security/health-check.mjs
```

The probe calls only `eth_chainId`, `eth_blockNumber`, and `eth_getBlockByNumber`. It requires chain ID 50383, a well-formed matching head and a block timestamp no older than 30 seconds, with no future timestamp. It emits one JSON object with `healthy`, `reason`, and `readyForTrading:false`. Exit code `0` means the RPC passed this narrow availability check, `1` means unavailable/wrong/stale state, and `2` means missing/invalid endpoint configuration. Endpoint URLs and raw provider exceptions are suppressed. Credentials in URL userinfo, query strings or fragments are rejected; use a public credential-free endpoint.

No retries, writes, wallet calls, live contract interaction or grants are performed. Do not reinterpret `healthy:true` as data integrity, consensus finality, signability, account readiness, USD loss verification, or profitability.

## Operational event logging

Keep an append-only operational incident trail *outside the repository*, with approved access controls. Use this minimal structured event schema:

| Field | Allowed content |
| --- | --- |
| `timestampUtc` | ISO-8601 UTC observation timestamp |
| `severity` | `INFO`, `WARN`, `ERROR`, `CRITICAL` |
| `eventCode` | Stable code such as `RPC_STALE`, `BLOCK_REORG`, `DIRECT_OPERATOR_BYPASS`, `AMBIGUOUS_BROADCAST` |
| `chainId` | Numeric chain ID; expected 50383 |
| `blockNumber` / `blockHash` | Public observed chain identifiers, if independently checked |
| `incidentId` | Random opaque identifier for correlation |
| `action` | `OBSERVE_ONLY`, `PAUSE_REQUIRED`, `MANUAL_REVIEW_REQUIRED` |

Never log signer material, private RPC URL, bearer tokens, seed phrases, raw signed transactions, full untrusted provider errors, user portfolio/account-sensitive data, or wallet client objects. Avoid dumping request objects. Emit coarse reason codes and preserve exact receipt evidence separately only where necessary, encrypted and access-controlled. Rotate and restrict logs, and do not upload private traces to public CI artifacts.

## Emergency disable and rollback

1. **Stop order ingress:** Disable agent scheduling and reject new intents. Require a manual incident owner; make the default outcome `BLOCK`.
2. **Pause the gate:** If deployed, an authorized administrator may submit `setPaused(true)` after independently verifying chain, contract address, signer and fee. **This is an external manual transaction, never performed by the health probe or CI.** Read the confirmed receipt and paused state.
3. **Remove bypass routes:** The trading owner reviews and revokes all direct bot operator permissions and unnecessary gate approvals using the verified registry UI/ABI. Confirm at a finalized block; never assume a submitted revocation succeeded.
4. **Reconcile uncertain submissions:** Treat timeouts or missing receipts as `AMBIGUOUS_BROADCAST`; check the chain and exchange order state before any new nonce or retry. Reconcile pending orders, fills, collateral and funding exposure.
5. **Restore prior known-good build:** Roll back off-chain infrastructure through the organization's normal release mechanism. Do not automatically redeploy a new on-chain gate or replay prior transactions. Contract state and registry permissions persist across off-chain rollback.
6. **Re-enable only with evidence:** Require independent sign-off on runtime code, configured limits, allowance consumption, exclusive operator path, block-pinned mark/account/loss provenance and emergency-pause recovery. Current MVP does **not** meet these live-trading conditions.

Trigger this procedure for wrong-chain RPC, stale/reorganized state, unknown contract code, confirmed direct operator bypass, signing material exposure, unexplained equity/accounting deltas, permission drift or ambiguous broadcasts. Escalate compromised credentials immediately for revocation/rotation; do not paste them into tickets or logs.

## Before testnet release

- Run `npm test`, `node --test scripts/security/*.test.mjs`, `forge test --root . -vv`, and the tracked-file secret scanner.
- Run health checks against the actual chosen read-only provider, recording only sanitized results.
- Prove actual perps registry ABI, gate runtime and operator permission against confirmed chain state.
- Test manual pause/revocation and recovery with a disposable, unfunded testnet identity before risking any STT or collateral.
- Publish simulation-only evidence as simulation, never transaction proof.
