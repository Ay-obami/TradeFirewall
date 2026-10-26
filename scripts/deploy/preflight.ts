import { pathToFileURL } from 'node:url';

export const HIDEKI_CHAIN_ID = 50383;
export const HIDEKI_RPC = 'https://api.hideki2.infra.testnet.somnia.network';
export const HIDEKI_OPERATOR_REGISTRY = '0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a';

const ADDRESS = /^0x[\da-fA-F]{40}$/;
const HEX = /^0x[\da-fA-F]+$/;

export type PublicRpc = (method:string, params:string[]) => Promise<unknown>;

function parseHex(raw:unknown,label:string):bigint {
  if(typeof raw !== 'string' || !HEX.test(raw)) throw new Error(`invalid RPC ${label}`);
  return BigInt(raw);
}

function requireAddress(address:string,label:string):void {
  if(!ADDRESS.test(address)) throw new Error(`invalid ${label} address`);
}

function hasCode(code:unknown,label:string):boolean {
  if(typeof code !== 'string' || !/^0x(?:[\da-fA-F]{2})*$/.test(code)) throw new Error(`invalid RPC ${label} bytecode`);
  return code !== '0x' && !/^0x0+$/.test(code);
}

/** Strictly read-only: there is no signer, private key, approval or eth_sendTransaction path. */
export async function runDeploymentPreflight(input:{
  rpc:PublicRpc;
  wallet:string;
  pool:string;
  registry:string;
  gate?:string;
}) {
  for(const label of ['wallet','pool','registry','gate'] as const){
    const value=input[label];
    if(value !== undefined) requireAddress(value,label);
  }

  const observed=parseHex(await input.rpc('eth_chainId',[]),'chain ID');
  if(observed !== BigInt(HIDEKI_CHAIN_ID)) return {
    mode:'READ_ONLY_PREFLIGHT' as const,
    chainId:Number(observed), balanceWei:0n,
    readyForDeployment:false, readyForTrading:false,
    blockers:[`wrong network: expected ${HIDEKI_CHAIN_ID}`],
    pending:['operator approval not verified','live perps order not verified'],
  };

  const [balanceRaw,poolCode,registryCode,gateCode] = await Promise.all([
    input.rpc('eth_getBalance',[input.wallet,'latest']),
    input.rpc('eth_getCode',[input.pool,'latest']),
    input.rpc('eth_getCode',[input.registry,'latest']),
    input.gate ? input.rpc('eth_getCode',[input.gate,'latest']) : Promise.resolve(undefined),
  ]);
  const balanceWei=parseHex(balanceRaw,'balance');
  const blockers:string[]=[];
  if(balanceWei === 0n) blockers.push('wallet has no gas');
  if(!hasCode(poolCode,'pool')) blockers.push('pool has no bytecode');
  if(!hasCode(registryCode,'registry')) blockers.push('registry has no bytecode');
  if(input.gate && !hasCode(gateCode,'gate')) blockers.push('gate has no bytecode');

  const pending=[
    'operator approval not verified',
    'perps contract-operator compatibility not verified',
    'live perps order not verified',
  ];
  if(!input.gate) pending.unshift('firewall gate deployment not verified');
  return {
    mode:'READ_ONLY_PREFLIGHT' as const,
    chainId:HIDEKI_CHAIN_ID, balanceWei,
    readyForDeployment:blockers.length===0,
    readyForTrading:false,
    blockers,pending,
  };
}

export function createPublicRpc(endpoint=HIDEKI_RPC, fetcher:typeof fetch=fetch):PublicRpc {
  const url=new URL(endpoint);
  if(url.protocol !== 'https:') throw new Error('RPC must use HTTPS');
  return async(method,params) => {
    if(!['eth_chainId','eth_getBalance','eth_getCode'].includes(method)) throw new Error('read-only RPC methods only');
    const result=await fetcher(url,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
      signal:AbortSignal.timeout(8_000),
    });
    if(!result.ok) throw new Error(`RPC_HTTP_${result.status}`);
    const payload=await result.json() as {result?:unknown,error?:unknown};
    if(payload.error || payload.result === undefined) throw new Error('RPC_ERROR');
    return payload.result;
  };
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , wallet,pool,gate] = process.argv;
  if(!wallet || !pool){
    process.stderr.write('Usage: node scripts/deploy/preflight.ts <public-wallet-address> <perps-pool-address> [deployed-gate-address]\n');
    process.exitCode=2;
  } else {
    runDeploymentPreflight({rpc:createPublicRpc(),wallet,pool,registry:HIDEKI_OPERATOR_REGISTRY,gate}).then(
      report=>{
        process.stdout.write(JSON.stringify({...report,balanceWei:report.balanceWei.toString()},null,2)+'\n');
        if(!report.readyForDeployment) process.exitCode=1;
      },
      err=>{process.stderr.write(`Preflight failed: ${String(err?.message ?? err)}\n`);process.exitCode=1;},
    );
  }
}
