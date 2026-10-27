/** Total economic equity = unlocked MarginBank equity + locked collateral, block-pinned.
 * The injected reader must be implemented using verified raw MarginBank calls at
 * the requested block. SDK 0.32.1 contains an internal getMarginEquity helper,
 * but the package does not publicly export that function.
 * These raw collateral units must not be fed into USD6 risk policy as-is.
 */
const BANK='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x[0-9a-fA-F]+$/;
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
type ReadSdk=(marginBank:string,account:string,at:bigint)=>Promise<unknown>;

export function createTotalEconomicEquityReader(deps:{rpc:Rpc;readMarginEquity:ReadSdk}){
  return Object.freeze({
    async read(input:{account:string;blockNumber:bigint}){
      if(!ADDRESS.test(input?.account))throw Error('INVALID_ACCOUNT');
      if(typeof input?.blockNumber!=='bigint'||input.blockNumber<0n)throw Error('INVALID_BLOCK');
      const chain=await deps.rpc('eth_chainId',[]);
      if(typeof chain!=='string'||!HEX.test(chain)||BigInt(chain)!==50383n)throw Error('WRONG_CHAIN');
      const tag=`0x${input.blockNumber.toString(16)}`;
      const getBlock=async()=>{
        const raw=await deps.rpc('eth_getBlockByNumber',[tag,false]);
        if(!raw||typeof raw!=='object')throw Error('INVALID_BLOCK_RESPONSE');
        const b=raw as Record<string,unknown>;
        if(typeof b.number!=='string'||!HEX.test(b.number)||BigInt(b.number)!==input.blockNumber||
          typeof b.hash!=='string'||!HASH.test(b.hash)||
          typeof b.timestamp!=='string'||!HEX.test(b.timestamp))throw Error('INVALID_BLOCK_RESPONSE');
        return {hash:b.hash.toLowerCase(),timestampSec:BigInt(b.timestamp)};
      };
      const before=await getBlock();
      const raw=await deps.readMarginEquity(BANK,input.account,input.blockNumber);
      if(!raw||typeof raw!=='object')throw Error('INVALID_MARGIN_EQUITY');
      const state=raw as Record<string,unknown>;
      if(state.asOfBlock!==input.blockNumber)throw Error('SDK_BLOCK_MISMATCH');
      if(typeof state.equity!=='bigint'||typeof state.lockedCollateral!=='bigint'||
        state.lockedCollateral<0n)throw Error('INVALID_MARGIN_EQUITY');
      const after=await getBlock();
      if(after.hash!==before.hash)throw Error('REORG_DETECTED');
      return Object.freeze({account:input.account,marginBank:BANK,chainId:50383 as const,
        blockNumber:input.blockNumber,blockHash:before.hash,timestampSec:before.timestampSec,
        unlockedEquityRaw:state.equity,lockedCollateralRaw:state.lockedCollateral,
        totalEconomicEquityRaw:state.equity+state.lockedCollateral,
        authority:'BLOCK_PINNED_SDK_MARGIN_EQUITY' as const,
        collateralUnits:'RAW_UNVERIFIED_QUOTE' as const,riskExecutable:false as const});
    },
  });
}
