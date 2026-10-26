# Same-block SDK order-margin preflight

The pinned Somnia Markets SDK (`@somnia-chain/markets-sdk@0.32.1`) exposes `client.previewPerpOrderMargin({pool,marginBank,account,isBid,quantity,price})`. Unlike some account health methods, its response includes `asOfBlock`, the exact block pinned for all reads inside that method.

`src/account-state/order-margin-preflight.ts` validates chain `50383`, pool/bank/account identity, raw bigint order parameters, `priceable`, exact `asOfBlock === expectedBlock`, and all SDK admission flags: `sufficient`, `hasCollateralForLock`, `meetsInitialMargin`, plus absence of voucher, restricted-market and isolation blocks.

This is a **read-only preparatory check**. It does not sign, broadcast, guarantee future block acceptance, confirm linked-bot/operator permissions, prove historical equity, or independently verify a daily drawdown. The guard returns `readyForTrading:false` even when margin admission passes. It is not yet wired to a production live order path until the independent source of `expectedBlock` and daily-loss risk is established.

SDK source: `node_modules/@somnia-chain/markets-sdk/src/perp/margin.ts` type `PerpOrderMarginPreview` (includes `asOfBlock` and gate fields), and `src/somniaMarketsClient.ts` method declaration. Official [SDK reference](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/SomniaMarketsClient).
