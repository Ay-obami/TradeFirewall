# Gate deployment and Wallet 2 owner signing — live transaction checklist

This is an **unsigned transaction preparation**, not a successful deployment. The public accounts are:

- Deployer / bot: `0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D` (17.65 STT at last observation)
- Administrator / trading owner (dreamDEX Wallet 2): `0x4da63430901076bF33Ea7E9EA47CCEb6b5578bA1`
- ZRO PerpPool: `0x2a1822b02039ddf0e293f3f7243673fc03eaf16c`
- OperatorPermissionsRegistry: `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a`
- Chain: Somnia Hideki `50383`

## Phase 1 — Deploy reviewed Gate

1. Owner should review that Gate administrator and `tradingOwner` both point to Wallet 2, while `bot` points to the funded gas wallet. The bot must **not** be administrator.
2. Sign the compiled `TradeFirewallGate(admin,bot,owner)` creation transaction **with the bot/deployer wallet**. The full unsigned calldata is saved on the Ubuntu host in `/tmp/tradefirewall-gate-deploy-calldata.json`; no signing material is in that file. The deployer's wallet must support reviewing contract creation calldata. Do not paste secrets into chat or shell history.
3. Check the contract address from a **successful receipt**, compare runtime bytecode and immutable roles, and check the network and transaction input. Never assume a predicted address is deployed.
4. Wallet 2 signs `configureMarket` and `setMarketGrossLimit` **only** after verified market decimals, bounds, and a reviewed budget; the administrator is Wallet 2.

## Phase 2 — Migrate owner grants

5. Wallet 2 must approve the **Gate** as operator for the particular Perps pool and `placeOrderFor` selector `0x80054449`, using verified registry `setOperatorApprovalForPool(pool, gate, [0x80054449], true)`.
6. Wallet 2 removes the bot's **direct** approval, and then independently queries `isOperatorAuthorized(owner,gate,0x80054449)==true` and `isOperatorAuthorized(owner,bot,0x80054449)==false` at the same block.
7. Verify all receipts before the first permitted bot order. Leave the bot's existing link intact **until** the actual Gate can be authorized, then promptly revoke the direct grant. Never claim full firewall enforcement while both are authorized.

## Phase 3 — Protected order

8. Do not send any `submit` until authoritative risk-policy, live market mark, independent day-loss accounting and exact account collateral checks all pass the project's guarded executor. A healthy SDK mark diagnostic alone does not satisfy this requirement.
9. After a verified policy decision, submit a tiny bounded order through the Gate and reconcile transaction success, order acceptance, and fills separately.

**No credentials or private keys are required for preparing or verifying these artifacts.**
