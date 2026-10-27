/** Protocol-derived, read-only PnL/funding cross-check. Not a daily-loss oracle.
 * Supply the official SDK's listPerpPositionAnalytics({marginBank,account}).
 * SDK position analytics are pinned to a block internally; we reject mixing blocks.
 */
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x[0-9a-fA-F]+$/;
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
type Position={priceable:boolean;asOfBlock:bigint;pool:string;size:bigint;
  notional?:bigint;unrealizedPnl?:bigint;accruedFunding?:bigint;equityContribution?:bigint};

export function createSdkPositionCrosscheck(deps:{rpc:Rpc;
  listPositionAnalytics:(params:{marginBank:string;account:string})=>Promise<Position[]>}){
  return Object.freeze({
    async read(input:{marginBank:string;account:string}){
      if(!ADDRESS.test(input?.marginBank)||!ADDRESS.test(input?.account))throw Error('INVALID_ADDRESS');
      const network=await deps.rpc('eth_chainId',[]);
      if(typeof network!=='string'||!HEX.test(network)||BigInt(network)!==50383n)throw Error('WRONG_CHAIN');
      const rows=await deps.listPositionAnalytics(input);
      if(!Array.isArray(rows)||rows.length===0)throw Error('NO_POSITION_SNAPSHOT');
      const at=rows[0]?.asOfBlock;
      if(typeof at!=='bigint'||at<0n)throw Error('INVALID_BLOCK');
      const tag=`0x${at.toString(16)}`;
      const block=async()=>{
        const raw=await deps.rpc('eth_getBlockByNumber',[tag,false]);
        if(!raw||typeof raw!=='object')throw Error('INVALID_BLOCK_RESPONSE');
        const b=raw as Record<string,unknown>;
        if(typeof b.number!=='string'||!HEX.test(b.number)||BigInt(b.number)!==at||
          typeof b.hash!=='string'||!HASH.test(b.hash)||
          typeof b.timestamp!=='string'||!HEX.test(b.timestamp))throw Error('INVALID_BLOCK_RESPONSE');
        return {hash:b.hash.toLowerCase(),timestampSec:BigInt(b.timestamp)};
      };
      const before=await block();
      const pools=new Set<string>();
      let notional=0n,pnl=0n,funding=0n,contribution=0n;
      for(const row of rows){
        if(row?.asOfBlock!==at)throw Error('BLOCK_MISMATCH');
        if(!ADDRESS.test(row.pool))throw Error('INVALID_POOL');
        const key=row.pool.toLowerCase();
        if(pools.has(key))throw Error('DUPLICATE_POOL');
        pools.add(key);
        if(row.priceable!==true)throw Error('UNPRICEABLE_POSITION');
        if(typeof row.size!=='bigint'||typeof row.notional!=='bigint'||row.notional<0n||
          typeof row.unrealizedPnl!=='bigint'||typeof row.accruedFunding!=='bigint'||
          typeof row.equityContribution!=='bigint')throw Error('INVALID_POSITION_METRICS');
        if(row.equityContribution!==row.unrealizedPnl-row.accruedFunding)
          throw Error('EQUITY_CONTRIBUTION_MISMATCH');
        notional+=row.notional;pnl+=row.unrealizedPnl;funding+=row.accruedFunding;
        contribution+=row.equityContribution;
      }
      const after=await block();
      if(before.hash!==after.hash)throw Error('REORG_DETECTED');
      return Object.freeze({chainId:50383 as const,account:input.account,marginBank:input.marginBank,
        blockNumber:at,blockHash:before.hash,timestampSec:before.timestampSec,
        positionCount:rows.length,totalNotionalRaw:notional,totalUnrealizedPnlRaw:pnl,
        totalFundingOwedRaw:funding,totalEquityContributionRaw:contribution,
        authority:'SDK_BLOCK_PINNED_POSITION_ANALYTICS' as const,riskExecutable:false as const});
    },
  });
}
