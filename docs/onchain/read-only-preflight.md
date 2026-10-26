# Hideki firewall deployment preflight (read-only)

The `scripts/deploy/preflight.ts` utility inspects public chain data before anyone attempts to deploy or approve TradeFirewallGate. It **does not deploy a contract, sign, request wallet access, modify operator permissions or place orders**.

On the Ubuntu project checkout:

```bash
node scripts/deploy/preflight.ts \
  0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D \
  0x2a1822b02039ddf0e293f3f7243673fc03eaf16c
```

These addresses are public sample values (TradeFirewall wallet and live-read ZRO Perps pool). Substitute the exact wallet and intended pool before assessing deployment; optionally pass a third public address for an already deployed gate.

The utility verifies RPC chain ID `50383`, native-token gas balance, pool contract bytecode, OperatorPermissionsRegistry bytecode, and optional gate bytecode. It exits nonzero when the known prerequisites fail. It validates no ABI nor privilege grant; an address with bytecode could still be wrong or unsafe.

Even if `readyForDeployment` is true, `readyForTrading` is **always false**. Operator authorization scope, deployed perps function selectors, contract-operator acceptance, and actual on-chain order results need separate verification with a narrowly controlled funded wallet. This preflight cannot prove them. It does not compute gas estimates or guarantee a nonzero balance is sufficient.

No private keys, seed phrases or bearer tokens are accepted. The script only permits `eth_chainId`, `eth_getBalance` and `eth_getCode` on HTTPS RPC.
