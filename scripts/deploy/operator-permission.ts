import type { PublicRpc } from './preflight.ts';

const HIDEKI_CHAIN_ID = 50383;
const ADDRESS = /^0x[\da-fA-F]{40}$/;

/**
 * No verified Hideki perps operator-check ABI is published in the developer
 * instructions we inspected. SpotPool approvals/selectors are NOT evidence
 * that a perps pool will authorize an operator.
 * This inspection intentionally makes no authorization claim.
 */
export async function inspectOperatorRegistry(input:{registry:string,rpc:PublicRpc}) {
  if (!ADDRESS.test(input.registry)) throw new Error('invalid registry address');
  const chainRaw = await input.rpc('eth_chainId',[]);
  if (typeof chainRaw !== 'string' || !/^0x[\da-fA-F]+$/.test(chainRaw)) throw new Error('invalid chain ID');
  const chainId = BigInt(chainRaw);
  if (chainId !== BigInt(HIDEKI_CHAIN_ID)) return {
    chainId:Number(chainId), registryHasCode:false,
    operatorAuthorization:'UNKNOWN_NOT_VERIFIED' as const,
    readyForTrading:false,
    reason:'wrong Hideki network',
  };

  const code = await input.rpc('eth_getCode',[input.registry,'latest']);
  if (typeof code !== 'string' || !/^0x(?:[\da-fA-F]{2})*$/.test(code)) throw new Error('invalid registry code');
  const registryHasCode = code.length > 2 && !/^0x0+$/.test(code);
  return {
    chainId:HIDEKI_CHAIN_ID, registryHasCode,
    operatorAuthorization:'UNKNOWN_NOT_VERIFIED' as const,
    readyForTrading:false,
    reason:registryHasCode
      ? 'Perps-specific operator authorization ABI and pool acceptance not verified'
      : 'operator registry bytecode missing',
  };
}

/**
 * Read-only, live-perps-pool operator check. The selector was derived from
 * isOperatorAuthorized(address,address,bytes4) and the signature successfully
 * eth_call'd against the Hideki ZRO PerpPool on 2026-10-26.
 *
 * A true result confirms a permission bit at that block, not compatibility
 * of an undeployed firewall or completeness of risk policy. Never broadcast.
 */
export async function inspectPerpPoolOperatorAuthorization(input:{
  pool:string;owner:string;operator:string;rpc:PublicRpc;
}) {
  for(const value of [input.pool,input.owner,input.operator]) {
    if(!ADDRESS.test(value)) throw new Error('INVALID_ADDRESS');
  }
  const chain=await input.rpc('eth_chainId',[]);
  if (typeof chain!=='string' || !/^0x[0-9a-fA-F]+$/.test(chain)) throw new Error('INVALID_CHAIN_RESPONSE');
  if(BigInt(chain)!==BigInt(HIDEKI_CHAIN_ID)) return {
    permission:'UNKNOWN_NOT_VERIFIED' as const,readyForTrading:false,reason:'WRONG_CHAIN',
  };
  const code=await input.rpc('eth_getCode',[input.pool,'latest']);
  if(typeof code!=='string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) throw new Error('INVALID_CODE_RESPONSE');
  if(code==='0x' || /^0x0+$/.test(code)) return {
    permission:'UNKNOWN_NOT_VERIFIED' as const,readyForTrading:false,reason:'POOL_CODE_MISSING',
  };
  const addressArg=(address:string)=>address.slice(2).toLowerCase().padStart(64,'0');
  const data='0xa8cb3794'+addressArg(input.owner)+addressArg(input.operator)+'80054449'.padEnd(64,'0');
  const raw=await input.rpc('eth_call',[{to:input.pool,data},'latest']);
  if(typeof raw!=='string' || !/^0x[0-9a-fA-F]{64}$/.test(raw) || (BigInt(raw)!==0n && BigInt(raw)!==1n)) {
    throw new Error('INVALID_PERMISSION_RESPONSE');
  }
  return {
    permission:BigInt(raw)===1n?'AUTHORIZED' as const:'NOT_AUTHORIZED' as const,
    readyForTrading:false,
    reason:'POOL_PERMISSION_READ_ONLY; CONTRACT_OPERATOR_AND_RISK_NOT_VERIFIED',
  };
}
