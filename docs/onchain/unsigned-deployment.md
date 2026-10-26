# TradeFirewallGate unsigned deployment artifact

`prepareUnsignedGateDeployment` in `scripts/deploy/unsigned-plan.ts` is a pure constructor encoder for the on-chain gate. It takes the *creation bytecode* from a verified build of `contracts/TradeFirewallGate.sol`, together with public addresses for the administrator, bot, and trading wallet owner.

It returns a transaction proposal (`to: null`, constructor-encoded `data`, `value: 0x0`, `chainId: 50383`) that is intentionally labeled `readyToBroadcast: false`. It never loads private keys or submits transactions. The adapter does **not** verify build bytecode provenance, runtime operator privileges, or sufficient gas. Reproduce the Solidity build on the intended compiler settings (`foundry.toml`) and independently compare creation bytecode before using any proposed deployment data.

Before eventual funded deployment:

1. Independently verify the trusted administrator, dedicated bot, and trading-owner addresses; the administrator and bot must be distinct. Do not authorize an untrusted bot directly in dreamDEX's registry.
2. Verify actual Hideki chain ID `50383` and intended pool/registry addresses with read-only probes.
3. Confirm the *perps* operator-approval ABI and exact required permission scope from authoritative dreamDEX sources. Spot-market operator APIs are not interchangeable.
4. Deploy the gate from an explicitly approved wallet, verify source/constructor arguments, configure only vetted pools and quantity/price bounds, and keep the gate paused until approvals and independent risk data are proven.
5. Grant narrowly scoped operator approval **to the gate** using a user-controlled wallet if supported by the verified registry implementation. Use small test orders and independently verify exchange order state and fills. A mined transaction alone does not prove the perps order was filled.

Until those prerequisites are independently verified, this code is a build-time artifact only, not a deployable/trading-ready runbook. Funded activity requires the user's separate confirmation and wallet signing in a trusted interface.
