# TradeFirewall execution adapter

This directory implements the authorization boundary, **not a live SDK signer**. It compiles and tests offline on Node 24 using `node tests/adapter/guarded-executor.test.ts`.

## Contracts and network

- dreamDEX perps deployment: Somnia **Hideki**, chain ID **50383**.
- Official SDK: `@somnia-chain/markets-sdk@0.32.1` (pin this exact version when the live driver is introduced).
- Official SDK constructor uses `hidekiTestnet`, `SOMNIA_HIDEKI_TESTNET_ADDRESSES` and the Hideki indexer URL.
- Resolve market-specific `poolAddress`, `marginBank`, `quoteToken`, base/quote decimals and tick/lot sizes through the SDK; don't hardcode or assume 18 decimals.
- The SDK's on-chain writes must be isolated behind `PerpsExecutionPort.submitOrder`. The SDK's relevant read APIs, plus an independently validated account/state index, must supply `PerpsReadPort.readSnapshot`.

## Security model

Only the trusted process that owns the `submitOrder` implementation gets a signer/operator key. The bot receives a restricted RPC method that requests trade preparation, and may send an opaque `approvalId` to request submission. `prepare` invokes independent policy, binds exact trade fields to a fresh market/account snapshot and an unguessable approval ID, and refuses policy mutations outside quantity reduction. An ID is single-use, expires, is invalidated by state drift, and remains account-exclusive while submission is in flight. `dryRun` exercises all checks without placing an order.

**Critical limitations:** This authorization map is in-process only. Multi-replica production requires a durable atomic reservation/consumption store; a transaction hash is not finality, so the account lock must persist until a receipt and updated account state are reconciled. An agent with access to the unrestricted wallet private key, an unrestricted on-chain operator permission, or the raw SDK `trader.placePerpOrder` API could bypass an off-chain firewall entirely. Never claim independent enforcement unless all order-capable routes are held behind the gate or equivalent on-chain policy checks.

**No signing path has been implemented or tested against dreamDEX yet.** Live trade evidence remains blocked by access to Hideki STT and a dedicated, correctly permissioned wallet.
