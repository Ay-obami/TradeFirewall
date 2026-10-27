/** Read-only Hideki perps collateral identification and nominal USDso scaling.
 * USDso is a quote denomination, not proof of a redeemable USD peg. This
 * module deliberately never reports certified USD value or trade authority.
 */
const BANK='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const COLLATERAL='0xed7993A74dAe1e6656B704A424DcD8711aAf4F72';
const HASH=/^0x[\da-fA-F]{64}$/;
const HEX=/^0x[\da-fA-F]+$/;
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
type ReadConfig=(marginBank:string,at:bigint)=>Promise<unknown>;

export function createCollateralProvenanceReader(deps:{rpc:Rpc;readPerpSystemConfig:ReadConfig}){
  return Object.freeze({
    async read(input:{blockNumber:bigint;amountRaw:bigint}){
      if(typeof input?.blockNumber!=='bigint'||input.blockNumber<0n)throw Error('INVALID_BLOCK');
      if(typeof input.amountRaw!=='bigint'||input.amountRaw<0n)throw Error('INVALID_COLLATERAL_AMOUNT');
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
        return b.hash.toLowerCase();
      };
      const before=await getBlock();
      const configRaw=await deps.readPerpSystemConfig(BANK,input.blockNumber);
      if(!configRaw||typeof configRaw!=='object')throw Error('INVALID_PERPS_CONFIG');
      const config=configRaw as Record<string,unknown>;
      if(config.asOfBlock!==input.blockNumber)throw Error('SDK_BLOCK_MISMATCH');
      if(config.fullyWired!==true)throw Error('UNWIRED_PERPS_CONFIG');
      if(typeof config.collateralToken!=='string'||config.collateralToken.toLowerCase()!==COLLATERAL.toLowerCase())
        throw Error('COLLATERAL_MISMATCH');
      const code=await deps.rpc('eth_getCode',[COLLATERAL,tag]);
      if(typeof code!=='string'||!/^0x(?:[\da-fA-F]{2})+$/.test(code))throw Error('MISSING_COLLATERAL_CODE');
      const decimalsRaw=await deps.rpc('eth_call',[{to:COLLATERAL,data:'0x313ce567'},tag]);
      if(typeof decimalsRaw!=='string'||!HASH.test(decimalsRaw))throw Error('INVALID_DECIMALS_RESPONSE');
      const decimals=BigInt(decimalsRaw);
      if(decimals!==18n)throw Error('COLLATERAL_DECIMALS_MISMATCH');
      if(await getBlock()!==before)throw Error('REORG_DETECTED');
      return Object.freeze({chainId:50383 as const,marginBank:BANK,collateralAddress:COLLATERAL,
        collateralDecimals:18 as const,blockNumber:input.blockNumber,blockHash:before,
        amountRaw:input.amountRaw,
        /** Exact floor from 18-decimal USDso into six nominal USDso places. */
        nominalUsdso6:(input.amountRaw/1_000_000_000_000n).toString(),
        usdValue6:null,usdPriceAuthority:'UNVERIFIED' as const,
        authority:'BLOCK_PINNED_PERPS_COLLATERAL_IDENTITY' as const,riskExecutable:false as const});
    },
  });
}
