# Hideki perps operator permission: evidence and unresolved ABI

**Research date:** October 26, 2026. This is read-only research, not a successful authorization or deployment.

## Confirmed from dreamDEX official documentation

- Somnia Hideki testnet is chain ID `50383`, with `OperatorPermissionsRegistry` at `0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a`. [Perps developer guide](https://app.testnet.dreamdex.io/docs/developers/perps-testnet).
- A raw PerpPool operator places on behalf of an owner with `placeOrderFor(address owner,bool isBid,uint64 userData,uint256 price,uint256 quantity,uint64 expireTimestampNs,uint8 orderType,uint8 selfMatchingOption,address builder,uint96 builderFeeBpsTimes1k)` and receives `(bool success,uint128 orderId)`. The perps developer guide documents this signature. This is not a grant transaction.
- The [Link a Bot guide](https://app.testnet.dreamdex.io/docs/trading/common/link-a-bot) provides the supported UI flow: select a Somnia Account wallet (not Legacy Account), choose Link a Bot, paste *only* the bot's public address, select Perps, and grant. Perps access is **market by market**; a new market requires another grant. The bot pays its own gas, while all fills belong to the owner. The app can optionally send STT for gas from the selected wallet.
- The [Spot operator guide](https://app.testnet.dreamdex.io/docs/trading/spot/operators) names `placeOrderFor` capability selector `0x80054449`, plus `cancelOrderFor` `0xe37b444b` and `reduceOrderFor` `0x364c2587`; its example registry addresses and per-pool/global approval calls are explicitly for mainnet `5031` and Shannon `50312`. The Hideki guide does **not** provide a perps-specific registry approval ABI, so these are reference data, **not a verified Hideki grant recipe**.
- The [bot-kit session-key guide](https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/docs/session-keys.md) shows cold-owner/hot-operator separation and narrow per-pool approval for Spot trading; its verified example concerns mainnet Spot, not Hideki perps.

## Consequences for TradeFirewall

1. It is safe to build read-only diagnostics checking chain ID, bytecode and documented market addresses. Bytecode presence does **not** imply a particular operator has authorization.
2. It is **not safe** to construct a raw grant transaction by copying SpotPool approval signatures from Shannon/Mainnet, or to assume a smart-contract firewall can be linked through the app like a standard externally-owned bot address.
3. The Link a Bot UI is a viable owner-controlled path for an EOA bot and is explicitly documented as supporting Perps. To require on-chain TradeFirewallGate enforcement, the team must still prove the pool permits a contract operator through that same grant path and that the gate's calldata/returns match the actual perps pool. A bot that can independently call the pool can bypass the gate; operator permissions must enforce the intended route.
4. Funding the operator alone does not solve all integration uncertainties: a usable paper-USDso margin balance and market grant, verified same-block account risk inputs, and authoritative order/fill reconciliation also remain necessary.

## Exact question for dreamDEX support

> For Somnia Hideki (`50383`) Perps, can the trading wallet grant `placeOrderFor` authorization to a deployed **contract** address, rather than only to a bot EOA via Link a Bot? If yes, could you share the verified Hideki `OperatorPermissionsRegistry` ABI/read-only `isApproved` signature and the supported per-market grant entrypoint, plus any PerpPool-specific restriction on contract operators? We want to verify the permission and enforce risk limits on-chain without assuming that Shannon/Mainnet Spot approval selectors apply to Hideki Perps.

Until this is answered and verified by a read-only live call, report `operatorAuthorization: UNKNOWN_NOT_VERIFIED` and `readyForTrading: false`.
