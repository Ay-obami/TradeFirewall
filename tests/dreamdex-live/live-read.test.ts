import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapHidekiReadClient, createLiveSdkReadOnly, createMarketRiskResolver } from '../../src/dreamdex-live/live-read.ts';

const ACCOUNT = '0x1111111111111111111111111111111111111111' as const;
const POOL = '0x2222222222222222222222222222222222222222' as const;
const BANK = '0x3333333333333333333333333333333333333333' as const;
const USD = '0x4444444444444444444444444444444444444444' as const;
const TIME = 2_000_000;
const market = {baseSymbol:'BTC',poolAddress:POOL,marginBank:BANK,quoteToken:USD,baseDecimals:8,quoteDecimals:6,tickSize:100_000n,lotSize:100n,minQuantity:100n};
const snapshot = {account:ACCOUNT,market:POOL,chainId:50383,blockNumber:25n,observedAtMs:TIME,snapshotId:'25:0',availableMarginRaw:1_000_000n,currentPositionRaw:200_000n,markPriceRaw:100_000_000_000n};

test('bootstraps documented SomniaMarkets in read-only mode on Hideki', async () => {
  let options: Record<string,unknown> | undefined;
  class FakeMarkets {
    client = { listPerpMarkets: async () => [market] };
    constructor(v: Record<string,unknown>) { options = v; }
  }
  const instance = bootstrapHidekiReadClient({SomniaMarkets:FakeMarkets,hidekiTestnet:{id:50383},SOMNIA_HIDEKI_TESTNET_ADDRESSES:{perpFactory:POOL}});
  assert.equal(instance.client, (instance as any).client);
  assert.equal((options?.chain as any)?.id, 50383);
  assert.equal(options?.indexerUrl, 'https://hideki-dev.smk.somnia.host/v1/graphql');
  assert.ok(!('privateKey' in (options ?? {})));
});

test('rejects SDK chain mismatch before initializing client', () => {
  assert.throws(() => bootstrapHidekiReadClient({SomniaMarkets:class {},hidekiTestnet:{id:50312},SOMNIA_HIDEKI_TESTNET_ADDRESSES:{}}), /WRONG_CHAIN/);
});

test('wires the real documented SDK reads to a verified RPC chain and account snapshot', async () => {
  const calls: string[] = [];
  const sdk = {
    client: {
      listPerpMarkets: async () => { calls.push('markets'); return [market]; },
      getPerpSystemConfig: async () => { calls.push('config'); return {collateral:USD}; },
      getMaxPerpOrderSize: async () => { calls.push('sizing'); return {priceable:true,placeable:true,maxQuantity:100_000n}; },
    },
  };
  const reader = await createLiveSdkReadOnly({
    sdk,
    readChainId: async () => 50383,
    readAccountSnapshot: async () => snapshot,
    nowMs: () => TIME,
  });
  assert.equal((await reader.getMarket('BTC')).poolAddress,POOL);
  assert.equal((await reader.readSnapshot({account:ACCOUNT,market:POOL})).snapshotId,'25:0');
  const size = await reader.quote('BTC',ACCOUNT,'buy','101000','0.001');
  assert.equal(size.maxQuantityRaw,100_000n);
  assert.deepEqual(calls,['markets','config','markets','config','sizing']);
});

test('refuses SDK reads on RPC-reported wrong chain', async () => {
  await assert.rejects(createLiveSdkReadOnly({sdk:{client:{} as any},readChainId:async()=>50312,readAccountSnapshot:async()=>snapshot}),/WRONG_CHAIN/);
});

function resolver(overrides: Record<string,unknown> = {}) {
  const readOnly = {
    getMarket: async (_symbol:string) => market,
    readSnapshot: async (_params: any) => snapshot,
    quote: async () => ({priceable:true,placeable:true,maxQuantityRaw:1_000_000n,market}),
    ...(overrides.readOnly as object ?? {}),
  };
  return createMarketRiskResolver({
    readOnly, marketSymbol:'BTC',nowMs:()=>TIME,
    readPerformance: async () => ({equityUsd6:'500000000',dailyPnlUsd6:'-2000000'}),
    ...Object.fromEntries(Object.entries(overrides).filter(([key])=>key!=='readOnly')),
  } as any);
}

test('produces exact mark-derived micro-USD quotes and trusted context', async () => {
  const resolve = resolver();
  const quote = await resolve({account:ACCOUNT,market:POOL,side:'buy',priceRaw:101_000_000_000n,quantityRaw:100_000n,orderType:'limit',clientOrderId:'a'},snapshot);
  assert.equal(quote.marketSymbol,'BTC');
  assert.equal(quote.lotSizeRaw,100n);
  assert.equal(quote.quoteNotionalUsd6(100_000n),'100000000');
  assert.equal(quote.riskContext.signedPositionUsd6,'200000000');
  assert.equal(quote.riskContext.equityUsd6,'500000000');
  assert.equal(quote.riskContext.dailyPnlUsd6,'-2000000');
  assert.equal(quote.leverageBps,6000); // (existing 200 + buy 100)/equity 500 = 0.6x
  assert.equal(quote.slippageBps,100); // 1% limit price worse than mark
});

test('rejects pool mismatch and malformed performance evidence', async () => {
  const q=resolver();
  await assert.rejects(q({account:ACCOUNT,market:BANK,side:'buy',priceRaw:101_000_000_000n,quantityRaw:100_000n,orderType:'limit',clientOrderId:'a'},snapshot),/MARKET_MISMATCH/);
  const bad=resolver({readPerformance:async()=>({equityUsd6:'0',dailyPnlUsd6:'NaN'})});
  await assert.rejects(bad({account:ACCOUNT,market:POOL,side:'buy',priceRaw:101_000_000_000n,quantityRaw:100_000n,orderType:'limit',clientOrderId:'a'},snapshot),/INVALID_PERFORMANCE/);
});

test('blocks stale account snapshot, mismatched metadata and zero mark', async () => {
  const q=resolver();
  const intent={account:ACCOUNT,market:POOL,side:'buy' as const,priceRaw:100_000_000_000n,quantityRaw:100_000n,orderType:'limit' as const,clientOrderId:'a'};
  await assert.rejects(q(intent,{...snapshot,observedAtMs:TIME-6000}),/STALE_SNAPSHOT/);
  await assert.rejects(q(intent,{...snapshot,markPriceRaw:0n}),/INVALID_MARK/);
  const wrong=resolver({readOnly:{getMarket:async()=>({...market,baseDecimals:77})}});
  await assert.rejects(wrong(intent,snapshot),/INVALID_DECIMALS/);
});

test('mark-priced notional rounds risk exposure conservatively upward', async () => {
  const q=resolver();
  const tiny=await q({account:ACCOUNT,market:POOL,side:'sell',priceRaw:100_000_000_000n,quantityRaw:100n,orderType:'limit',clientOrderId:'a'},snapshot);
  assert.equal(tiny.quoteNotionalUsd6(100n),'100000');
  assert.equal(tiny.leverageBps,3998); // 199.9 / 500, rounded upward
});

test('blocks unpriceable SDK marks and mismatched sizing markets before risk quoting', async () => {
  const intent={account:ACCOUNT,market:POOL,side:'buy' as const,priceRaw:100_000_000_000n,quantityRaw:100_000n,orderType:'limit' as const,clientOrderId:'a'};
  const unpriceable=resolver({readOnly:{quote:async()=>({priceable:false,placeable:false,market})}});
  await assert.rejects(unpriceable(intent,snapshot),/STALE_MARK/);
  const spoofed=resolver({readOnly:{quote:async()=>({priceable:true,placeable:true,maxQuantityRaw:100_000n,market:{...market,poolAddress:BANK}})}});
  await assert.rejects(spoofed(intent,snapshot),/MARKET_MISMATCH/);
});
