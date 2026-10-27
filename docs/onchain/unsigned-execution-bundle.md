# Unsigned execution bundle (Hideki 50383)

`prepareUnsignedExecutionBundle(input)` in `src/deploy/unsigned-execution-bundle.ts` constructs an **offline, unsigned, non-broadcastable** five-stage manifest:

1. Deploy reviewed `TradeFirewallGate` creation bytecode with `(administrator, bot, tradingOwner)`.
2. Administrator calls `configureMarket(pool,maxQuantityRaw,minPriceRaw,maxPriceRaw,true)` on the **gate** (`0x6983d62b`).
3. Administrator calls `setMarketGrossLimit(pool,grossQuantityRaw)` on the **gate** (`0x75c4bb62`).
4. Trading owner calls `setOperatorApprovalForPool(pool,gate,[0x80054449],true)` on the **documented Hideki perps registry** `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a` (`0x7bbc67e6`). An arbitrary registry target is rejected (case-insensitive matching, canonical target output). This authorizes **gate only**, for **one pool** and **one placeOrderFor capability**; never the bot directly.
5. Bot prepares `TradeFirewallGate.submit(Order)` for the gate (`0xa99b37c0`), with fresh nonce, unexpired on-chain seconds `deadline` and nanoseconds `expireTimestampNs`.

Example from a trusted Node TypeScript project:

```ts
import {prepareUnsignedExecutionBundle,inspectUnsignedBundleGasAndNonces} from './src/deploy/unsigned-execution-bundle.ts';

const bundle=prepareUnsignedExecutionBundle({
  chainId:50383, creationBytecode:reviewedCreationBytecode,
  deployer,administrator,bot,tradingOwner,
  gateAddress:independentlyCheckedExpectedGateAddress,
  pool:verifiedPerpPool,registry:'0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a',
  maxQuantityRaw:100n,minPriceRaw:1000n,maxPriceRaw:2000n,
  grossQuantityRaw:100n,nowSec:BigInt(Math.floor(Date.now()/1000)),
  order:verifiedFreshGateOrder,
});
// Optional read-only RPC adapter; no signing or sending methods are accepted.
const inspected=await inspectUnsignedBundleGasAndNonces(bundle,
  (method,params)=>readOnlyPublicRpc(method,params));
```

Inputs are example **variables**, not supplied credentials or production market parameters. `inspected.transactions` contains ABI calldata, expected signers, target, value, pending nonce estimates and possible gas limits. All records keep `readyToBroadcast:false`; no sender can sign or broadcast through this module. `gasPrice` is deliberately `null` pending independent fee review. The precomputed gate address must be independently reconciled against the actual deployment receipt/runtime and immutable roles; this module does not predict CREATE addresses or attest bytecode provenance.

The optional RPC inspection issues only `eth_chainId`, a pool `eth_call` for **bot direct** `isOperatorAuthorized(owner,bot,0x80054449)`, `eth_getTransactionCount` (`pending`) and `eth_estimateGas`. It refuses the wrong chain and any observed bot-direct grant. A gas estimate is **not** a simulation or proof of on-chain authorization, account collateral, policy approval or successful forwarding. Future-stage estimates may fail until preceding deployment/configuration/grant transactions are confirmed; missing estimates remain `null` with `GAS_ESTIMATE_UNAVAILABLE`. Pending nonces are a planning snapshot only; recheck nonce, fee and gas immediately before *each* distinct signing step.

**Mandatory hard stops:** Independently verify actual gate deployment/roles, registry/pool implementation and ABI, persisted exclusive grant (`owner→gate` true; `owner→bot` false) at confirmed block, gross remaining allowance, price/size and nonce state, authenticated risk snapshot, usable collateral, current order deadline, gas balances of all signers and sequential receipts. The order must be re-reviewed from fresh risk data; an expired prebuilt order must be discarded. No cryptographic signer, seed, private key, wallet client, transaction-send routine or execution authorization is part of this API.
