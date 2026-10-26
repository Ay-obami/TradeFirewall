import { pathToFileURL } from 'node:url';
import { bootstrapHidekiReadClient, HIDEKI_PERPS_CHAIN_ID, type SdkModule } from './live-read.ts';

const RPC = 'https://api.hideki2.infra.testnet.somnia.network';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function readHidekiRpcChainId(fetcher: typeof fetch = fetch): Promise<number> {
  const response = await fetcher(RPC, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
  const data = await response.json() as {result?:unknown,error?:unknown};
  if (typeof data.result !== 'string' || !/^0x[0-9a-f]+$/i.test(data.result) || data.error) throw new Error('INVALID_RPC_RESPONSE');
  const id = Number(BigInt(data.result));
  if (!Number.isSafeInteger(id)) throw new Error('INVALID_RPC_RESPONSE');
  return id;
}

type ReadModule = SdkModule;

export async function loadInstalledSdk(): Promise<ReadModule> {
  // Deliberately import only public SDK exports; never source credentials.
  const root = await import('@somnia-chain/markets-sdk');
  const chains = await import('@somnia-chain/markets-sdk/chains');
  return {
    SomniaMarkets: root.SomniaMarkets,
    SOMNIA_HIDEKI_TESTNET_ADDRESSES: root.SOMNIA_HIDEKI_TESTNET_ADDRESSES,
    hidekiTestnet: chains.hidekiTestnet,
  } as ReadModule;
}

export async function runHidekiReadSmoke(deps: {
  readChainId?: () => Promise<number>;
  loadSdk?: () => Promise<ReadModule>;
} = {}) {
  const chainId = await (deps.readChainId ?? readHidekiRpcChainId)();
  if (chainId !== HIDEKI_PERPS_CHAIN_ID) throw new Error('WRONG_CHAIN');
  const sdk = bootstrapHidekiReadClient(await (deps.loadSdk ?? loadInstalledSdk)()) as {
    client: {
      listPerpMarkets(): Promise<Array<{baseSymbol:string,poolAddress:string,marginBank:string}>>;
      getPerpSystemConfig(marginBank:string): Promise<{collateral?:unknown}>;
    };
  };
  if (typeof sdk.client.listPerpMarkets !== 'function' || typeof sdk.client.getPerpSystemConfig !== 'function') {
    throw new Error('INVALID_SDK_CLIENT');
  }
  const markets = await sdk.client.listPerpMarkets();
  if (!Array.isArray(markets) || markets.length === 0) throw new Error('NO_MARKETS');
  const first = markets[0];
  if (!first || typeof first.baseSymbol !== 'string' || !ADDRESS.test(first.poolAddress) || !ADDRESS.test(first.marginBank)) {
    throw new Error('INVALID_MARKET');
  }
  const config = await sdk.client.getPerpSystemConfig(first.marginBank);
  if (!config || !ADDRESS.test(String(config.collateral ?? ''))) throw new Error('INVALID_SYSTEM_CONFIG');
  return {
    chainId,
    marketCount:markets.length,
    sampleSymbol:first.baseSymbol,
    samplePool:first.poolAddress,
    systemConfigVerified:true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHidekiReadSmoke().then(
    result => process.stdout.write(JSON.stringify({mode:'LIVE_READ_ONLY',...result},null,2)+'\n'),
    err => {process.stderr.write(`Live-read smoke failed: ${String(err?.message ?? err)}\n`);process.exitCode=1;},
  );
}
