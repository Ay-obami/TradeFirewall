# Hideki perps contract-operator compatibility: read-only evidence

**Status: simulated grant accepted; persisted grant and order execution unverified.**
This evidence was captured on Somnia Hideki chain `50383`. It does not
authorize a transaction, certify account risk, or enable trading.

## Verified interfaces

Official dreamDEX perps documentation specifies
`placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)`
as a payable call returning `(bool,uint128)`. Its selector is `0x80054449`.
The deployed ZRO PerpPool accepts the read-only query
`isOperatorAuthorized(address,address,bytes4)` (selector `0xa8cb3794`).

At Hideki block `34175527`, hash
`0x147ff71f1ec1c0d95beb58d10edda10acc67baf34e0f39991509cbd186df5127`:

| Item | Verified address/value |
| --- | --- |
| OperatorPermissionsRegistry | `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a` |
| EIP-1967 registry implementation | `0x543d7c170b20e7f9571ad3538201ab9b297a63d3` |
| ZRO PerpPool | `0x2a1822b02039ddf0e293f3f7243673fc03eaf16c` |
| Example owner | `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D` |
| Grant selector (`setOperatorApprovalForPool`) | `0x7bbc67e6` |
| Registry per-pool read selector (`isApprovedForPool`) | `0x03684f95` |

The registry and pool had bytecode at this block. The example owner did **not**
have approval for the operator/selector pair tested: global, registry per-pool,
and pool-side authorization reads all returned `false`.

## Reproduce the contract-operator grant simulation

The operator address below is intentionally **the registry contract itself**:
the purpose is to test whether the permission setter rejects a contract
operator outright. It is not a recommended production operator or gate address.

```bash
cast call \
  0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a \
  'setOperatorApprovalForPool(address,address,bytes4[],bool)' \
  0x2a1822b02039ddf0e293f3f7243673fc03eaf16c \
  0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a \
  '[0x80054449]' true \
  --from 0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D \
  --block 34175527 \
  --rpc-url https://api.hideki2.infra.testnet.somnia.network
```

**Observed result:** `0x` without revert. `cast call` uses `eth_call`; it did not
change chain state, spend gas, or persist any approval. This narrows the
EOA-only concern to possible checks elsewhere in the perps execution path.

## What remains unproven

1. The deployed TradeFirewallGate address receiving a **persisted** owner grant
   for exactly the intended pool and `placeOrderFor` selector.
2. The perps pool accepting an actual `placeOrderFor` forwarded by that Gate.
3. Verification that the bot has no separate, direct `placeOrderFor` grant
   and cannot bypass Gate controls.
4. An authoritative, complete account-loss and USD valuation data source.

`readyForTrading` must remain `false` until these checks pass. Do not infer
success of item 2 from a successful simulated setter in item 1.

Sources:

- [Official dreamDEX perps developer guide](https://app.dreamdex.io/docs/developers/perps-testnet)
- [Somnia SDK operator params (helper contracts explicitly supported)](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/SetOperatorApprovalForPoolParams)
