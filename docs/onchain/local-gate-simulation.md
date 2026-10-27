# Deterministic local Gate lifecycle simulation

`simulateLocalGateLifecycle` in `src/deploy/local-gate-simulation.ts` is an **offline protocol double**, not an EVM fork, signer, transaction receipt or permission proof. It applies hypothetical actions in timestamp order and returns `LOCAL_SIMULATION_ONLY` with `readyToBroadcast:false`.

```ts
import {simulateLocalGateLifecycle} from './src/deploy/local-gate-simulation.ts';

const local=simulateLocalGateLifecycle({
  chainId:50383,administrator,bot,tradingOwner,gateAddress,pool,
  actions:[
    {kind:'deploy',from:administrator,atSec:1000n},
    {kind:'configure',from:administrator,atSec:1001n,pool,
      maxQuantityRaw:100n,minPriceRaw:1000n,maxPriceRaw:2000n,grossQuantityRaw:100n},
    {kind:'grant',from:tradingOwner,atSec:1002n,pool,operator:gateAddress,
      selector:'0x80054449',reviewExpiresAtSec:1100n},
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order},
    {kind:'include',from:bot,atSec:1004n,transactionNonce:8n},
  ],
});
```

All addresses, market limits and order fields must come from external verified data. The example numeric values are **not** market recommendations.

The simulator distinguishes two nonce domains:

- **Transaction nonce:** a pending hypothetical bot transaction can be replaced at the *same* nonce only while pending and with a strictly greater `maxFeePerGas` value. Only the last queued order is included. A mined nonce cannot be replayed. Real network replacement policies can demand larger bumps and involve other fee fields; this simulator does not attest mempool acceptance.
- **Gate order nonce:** an independently consumed `uint64` nonce in `Gate.submit(Order)`. Once included, a second order with the same Gate nonce is rejected even under a new transaction nonce.

An approval-review expiration is **off-chain only**. The actual Hideki perps operator approval has no such timestamp; an expired review does **not** revoke any on-chain permission. The simulator stops when the review has expired and requires a new independently verified owner authorization check before proceeding. Its `revoke` action is hypothetical and must not be confused with an on-chain revocation receipt.

Simulation checks deploy/configure/grant roles, exact pool and capability, bot-direct grant attempts, local order ABI validity, price limits, deadline seconds, expiry nanoseconds, quantity clamping, aggregate gross allowance, replacement conditions and Gate nonce replay. Re-configuring does not replenish spent gross allowance, mirroring the contract design. The simulator does not recreate the entire on-chain contract (e.g. external pool execution, oracle/account risk, EVM gas or all account state), and cannot authorize real trading.

For actual planning use the unsigned-only bundle; re-verify receipt-backed deployed code, administrator/bot/trading-owner immutables, exclusive gate permission, trustworthy risk and margin reads, nonce, fee and deadline immediately before any separate, human-reviewed wallet action. Neither module signs or broadcasts.
