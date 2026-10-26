# Hideki perps operator-permission inspection boundary

The Hideki developer reference identifies the OperatorPermissionsRegistry at
`0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a` on chain `50383`, but
does not document a **perps-specific** permission-check ABI, function selector
or proof that the firewall can act as a contract operator for the perps pool.

The separate SpotPool operator documentation discusses `isApproved`,
`isOperatorAuthorized`, and selectors for `placeOrderFor` on different Somnia
networks (`5031` and `50312`). **Do not reuse those selectors or assume SpotPool
permissions are perps permissions.**

`inspectOperatorRegistry` does strictly read-only `eth_chainId` and
`eth_getCode` checks. Even when the registry contains bytecode, it returns
`operatorAuthorization: UNKNOWN_NOT_VERIFIED` and `readyForTrading: false`.
Contract existence is not proof of permission.

To lift this blocker, obtain the verified Hideki perps registry ABI and exact
pool-side operator enforcement semantics, then write a regression test that
distinguishes approved/revoked/wrong-selector/wrong-pool users and compare
read-only live results. Any user grant or deployment remains a wallet-signing
action requiring funding and explicit authorization.

Sources:

- [dreamDEX perps developer guide](https://app.testnet.dreamdex.io/docs/developers/perps-testnet)
- [dreamDEX SpotPool operators (different network and product)](https://app.testnet.dreamdex.io/docs/trading/spot/operators)
