# Verified Wallet 2 signing constraint (2026-10-29)

Hideki wallet 2 is `0x4da63430901076bF33Ea7E9EA47CCEb6b5578bA1`; deployed Gate is `0x136843943A4EcA38648adb1578B1835f49FF2402`; the funded bot/login wallet is `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D`.

Live SDK `client.accounts.ownersOf(Wallet2)` returned exactly one owner, key `0x1b0769d6F925d4E613067a34763d3be3AE7e783e`, Safe threshold 1. `authorityPath(Wallet2,bot)` returned `null`. Thus the bot cannot operate Wallet 2 as a Safe owner even though it has a separate pool `placeOrderFor` operator grant.

`client.accounts.buildExecution({account:Wallet2,signer:embeddedOwner,calls:[...]})` succeeded and yielded a chain-bound `SafeTx` EIP-712 payload, confirming SDK planning capability, **not** a signing channel. The app-managed owner signature required to make it executable remains unavailable to this project's external integration. We must not forge, extract, impersonate, or solicit this key.

The official dreamDEX account security documentation states the embedded key is not exposed to outside applications, and a logged-in external wallet may be a second owner only if it was added as such. That is not the current on-chain state for Wallet 2. Sources:

- https://app.testnet.dreamdex.io/docs/security/risks
- https://new.docs.somnia.network/network/smart-accounts
- https://prd.smk.somnia.host/docs/typescript/release-notes

## Required supported resolution

Ask dreamDEX for an authenticated UI pathway to sign an arbitrary *reviewed* SafeTx as Wallet 2 (targeting the deployed Gate's `configureMarket` and `setMarketGrossLimit`, and the verified perps `OperatorPermissionsRegistry`), or a supported UI to authorize an **independent, owner-controlled administrative key** as an additional Safe owner. Never add the bot key as unrestricted owner: it would bypass Gate-only execution and gain custody-level powers.

After the account owner's explicit approval: re-read owners and `authorityPath`, inspect Safe transaction payload and gas sponsor, verify on-chain executed `msg.sender` is Wallet 2, then grant Gate-only `placeOrderFor` and revoke bot's direct permission. Require risk-source attestation before actual orders.

Alternative to discuss with the user: move the trading-owner setup to a new fully controlled account **only after** confirming venue account/margin support; do not claim the existing Wallet 2 can be migrated without venue support.

No owner, configuration, grant, or revoke transaction is authorized or sent by this verification.
