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
