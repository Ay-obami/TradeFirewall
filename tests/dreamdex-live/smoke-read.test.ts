import test from 'node:test';
import assert from 'node:assert/strict';
import { readHidekiRpcChainId, runHidekiReadSmoke } from '../../src/dreamdex-live/smoke-read.ts';

const MARKET = { baseSymbol: 'BTC', poolAddress: '0x2222222222222222222222222222222222222222', marginBank: '0x3333333333333333333333333333333333333333' };

test('smoke reads market and system config without passing a signer', async () => {
  let signerSupplied = false;
  const out = await runHidekiReadSmoke({
    readChainId: async () => 50383,
    loadSdk: async () => ({
      SomniaMarkets: class {
        client = {
          listPerpMarkets: async () => [MARKET],
          getPerpSystemConfig: async (bank: string) => ({ collateral: '0xed7993A74dAe1e6656B704A424DcD8711aAf4F72', bank }),
        };
        constructor(opts: Record<string,unknown>) { signerSupplied = 'privateKey' in opts; }
      },
      hidekiTestnet: { id: 50383 },
      SOMNIA_HIDEKI_TESTNET_ADDRESSES: {},
    }),
  });
  assert.deepEqual(out, {chainId:50383,marketCount:1, sampleSymbol:'BTC', samplePool:MARKET.poolAddress, systemConfigVerified:true});
  assert.equal(signerSupplied, false);
});

test('wrong RPC chain fails before loading SDK', async () => {
  let loaded = false;
  await assert.rejects(runHidekiReadSmoke({readChainId:async()=>50312,loadSdk:async()=>{loaded=true;throw Error('should not load');}}), /WRONG_CHAIN/);
  assert.equal(loaded,false);
});

test('empty market list and failed configuration do not produce a successful smoke report', async () => {
  const loadSdk = async () => ({SomniaMarkets:class {client={listPerpMarkets:async()=>[],getPerpSystemConfig:async()=>({})};},hidekiTestnet:{id:50383},SOMNIA_HIDEKI_TESTNET_ADDRESSES:{}});
  await assert.rejects(runHidekiReadSmoke({readChainId:async()=>50383,loadSdk}), /NO_MARKETS/);
  const broken = async () => ({
    SomniaMarkets: class {client={listPerpMarkets:async()=>[MARKET],getPerpSystemConfig:async()=>({collateral:null})};},
    hidekiTestnet:{id:50383},SOMNIA_HIDEKI_TESTNET_ADDRESSES:{},
  });
  await assert.rejects(runHidekiReadSmoke({readChainId:async()=>50383,loadSdk:broken}), /INVALID_SYSTEM_CONFIG/);
});

test('RPC chain reader rejects malformed JSON-RPC payload instead of assuming configured Hideki', async () => {
  const fake = async () => ({ok:true,json:async()=>({result:'not-hex'})});
  await assert.rejects(readHidekiRpcChainId(fake as any), /INVALID_RPC_RESPONSE/);
  const real = async () => ({ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:'0xc4cf'})});
  assert.equal(await readHidekiRpcChainId(real as any), 50383);
});
