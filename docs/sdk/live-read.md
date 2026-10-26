# Live dreamDEX SDK read boundary (Hideki)

This adapter deliberately **does not require testnet funds or a trading key**. It integrates the real documented SDK client-read methods while keeping any signing authority out of the process.

## Setup

The official developer documentation identifies `@somnia-chain/markets-sdk@0.32.1`, Somnia **Hideki** chain ID `50383`, and indexer `https://hideki-dev.smk.somnia.host/v1/graphql` for this SDK. The SDK constructor example is:

```ts
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';
import { bootstrapHidekiReadClient, createLiveSdkReadOnly } from '../../src/dreamdex-live/live-read.ts';

const sdk = bootstrapHidekiReadClient({
  SomniaMarkets,
  hidekiTestnet,
  SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});

// The RPC observer and account reader are integration dependencies, NOT dummy
// inputs. Do not proceed without a live RPC chain-ID check and verified source.
const readOnly = await createLiveSdkReadOnly({
  sdk: sdk as Parameters<typeof createLiveSdkReadOnly>[0]['sdk'],
  readChainId: async () => observedChainIdFromRpc,
  readAccountSnapshot: verifiedAccountReader,
});
const market = await readOnly.getMarket('BTC');
```

The `observedChainIdFromRpc` and `verifiedAccountReader` identifiers above are placeholders requiring production implementations; this is an **integration guide**, not a runnable live-trading example. The SDK instance has **no `privateKey`**. The read adapter invokes exactly the SDK's documented `listPerpMarkets`, `getPerpSystemConfig`, and `getMaxPerpOrderSize` methods and validates pool/collateral consistency, prices, lot sizing, and priceability.

## Risk quote requirements

`createMarketRiskResolver` accepts the validated read-only adapter and a separately verified `readPerformance(account,pool,block)` callback providing account equity and daily PnL as decimal integer *micro-USDso*. For every intent it first checks the SDK `getMaxPerpOrderSize` result through `readOnly.quote` to reject stale, unpriceable, or oversized orders. It also refuses stale or changed account snapshots, wrong network/pool, malformed economics, invalid lot sizes, and nonpositive equity. It uses exact `bigint` conversions from raw base quantity × raw mark price into USD6, conservatively rounding positive notionals up. It calculates projected exposure/leverage and adverse slippage from the mark and limit price, never trusting a model's proposed quote.

**Do not assume** that available margin equals account equity, or that a max-order-size API proves daily PnL or current positions. The SDK reads alone do **not** provide a verified comprehensive risk snapshot, trade history, or position equity oracle. These must be separately implemented against a verified chain/indexer and checked for consistent block identity. If they are missing, the guarded executor must remain unable to submit an order. `maxSnapshotAgeMs` defaults to 3,000 ms; live readers should synchronize samples at a common block and fail closed on drift.

## Verification level

The local suite uses deterministic fake SDK method responses to prove wiring, validation, signed/unsigned decimal handling, and fail-closed behavior. It does **not** attest to a successful live Somnia RPC query or live order. No testnet tokens, private keys, or transaction sends are needed for this stage.

Official references: [dreamDEX perps developer guide](https://app.testnet.dreamdex.io/docs/developers/perps-testnet), [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail).
