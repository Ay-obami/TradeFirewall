/** Historical read-only MarginBank equity with exact block pin and reorg check. */
const BANK='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x[0-9a-fA-F]+$/;
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;

export function createHistoricalEquityReader(deps:{rpc:Rpc}) {
  return Object.freeze({
    async read(input:{account:string;blockNumber:bigint}) {
      if(!ADDRESS.test(input?.account))throw Error('INVALID_ACCOUNT');
      if(typeof input?.blockNumber!=='bigint'||input.blockNumber<0n)throw Error('INVALID_BLOCK');
      const chain=await deps.rpc('eth_chainId',[]);
      if(typeof chain!=='string'||!HEX.test(chain)||BigInt(chain)!==50383n)throw Error('WRONG_CHAIN');
      const hexBlock=`0x${input.blockNumber.toString(16)}`;
      const readBlock=async()=>{
        const result=await deps.rpc('eth_getBlockByNumber',[hexBlock,false]);
        if(!result||typeof result!=='object')throw Error('INVALID_BLOCK_RESPONSE');
        const b=result as Record<string,unknown>;
        if(typeof b.number!=='string'||!HEX.test(b.number)||BigInt(b.number)!==input.blockNumber||
          typeof b.hash!=='string'||!HASH.test(b.hash)||
          typeof b.timestamp!=='string'||!HEX.test(b.timestamp))throw Error('INVALID_BLOCK_RESPONSE');
        return {hash:b.hash.toLowerCase(),timestampSec:BigInt(b.timestamp)};
      };
      const before=await readBlock();
      const data='0x792e6c4d'+input.account.slice(2).toLowerCase().padStart(64,'0');
      const raw=await deps.rpc('eth_call',[{to:BANK,data},hexBlock]);
      if(typeof raw!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(raw))throw Error('INVALID_EQUITY_RESPONSE');
      const encoded=BigInt(raw);
      const equityRaw=encoded>=1n<<255n?encoded-(1n<<256n):encoded;
      const after=await readBlock();
      if(before.hash!==after.hash)throw Error('REORG_DETECTED');
      return Object.freeze({account:input.account,marginBank:BANK,chainId:50383 as const,
        blockNumber:input.blockNumber,blockHash:before.hash,timestampSec:before.timestampSec,equityRaw,
        authority:'VERIFIED_HISTORICAL_CHAIN_READ' as const,
        /** Equity alone is not an authenticated daily-PnL or trading permit. */
        riskExecutable:false as const});
    },
  });
}
