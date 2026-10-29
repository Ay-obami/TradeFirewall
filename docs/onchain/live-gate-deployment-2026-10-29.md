# Verified live TradeFirewallGate deployment — 2026-10-29

Somnia Hideki chain 50383. Verification uses public RPC and locally compiled Foundry artifact. No signing keys accessed.

- Transaction: `0xb5432bbf9bf67acbef5edf1511c8b664d8541a1887073571e49fe8850f83ce06`
- Success receipt status: `0x1`; block: `36132507`; gas used: `10863166`.
- Deployed Gate: `0x136843943A4EcA38648adb1578B1835f49FF2402`.
- Administrator and trading owner (verified getter calls): `0x4da63430901076bF33Ea7E9EA47CCEb6b5578bA1`.
- Bot (verified getter): `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D`.
- `paused() == false` at read.
- Deployed runtime 3,149 bytes. After removing Solidity metadata (53 bytes) and masking the exact immutable reference locations from Foundry artifact, executable logic SHA-256 matches: `abf7f112358e2e47fb23f871027a07c6ef8abafefafb5f6afc1610ce9d3b87a7`. This match DOES NOT imply configuration/risk readiness.
- At block `36133930`, pool-side permission for direct bot `true`, Gate `false`.
- Gate `markets(ZRO pool)` returned `enabled=false`, zero configured bounds, and gross limit zero.

**Action needed:** Wallet 2 is Gate administrator and trading owner. Before attempting trading, review the exact ZRO market decimals, set conservative `configureMarket` bounds and `setMarketGrossLimit` using Wallet 2, then grant Gate scoped order placement and revoke direct bot permission. Independently read back all permissions at one block; do not send orders while any risk source is unverified. No post-deployment configuration or owner permission transactions have been sent by this automation.
