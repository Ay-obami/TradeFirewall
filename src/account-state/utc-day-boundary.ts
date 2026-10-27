/** Select the state snapshot immediately preceding UTC midnight.
 * Trades/events after this block belong to the current UTC trading day.
 */
const HEX=/^0x[0-9a-fA-F]+$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;

export async function findUtcDayStartBlock(input:{rpc:Rpc;asOfBlock:bigint}){
  const {rpc,asOfBlock}=input;
  if(typeof asOfBlock!=='bigint'||asOfBlock<1n)throw Error('INVALID_BLOCK');
  if(await rpc('eth_chainId',[])!=='0xc4cf')throw Error('WRONG_CHAIN');
  const getBlock=async(n:bigint)=>{
    const item=await rpc('eth_getBlockByNumber',[`0x${n.toString(16)}`,false]);
    if(!item||typeof item!=='object')throw Error('INVALID_BLOCK_RESPONSE');
    const e=item as Record<string,unknown>;
    if(typeof e.number!=='string'||!HEX.test(e.number)||BigInt(e.number)!==n||
      typeof e.hash!=='string'||!HASH.test(e.hash)||
      typeof e.timestamp!=='string'||!HEX.test(e.timestamp))throw Error('INVALID_BLOCK_RESPONSE');
    return {number:n,hash:e.hash.toLowerCase(),timestampSec:BigInt(e.timestamp)};
  };
  const head=await getBlock(asOfBlock);
  const utcDayStartSec=head.timestampSec/86400n*86400n;
  const genesis=await getBlock(0n);
  if(genesis.timestampSec>=utcDayStartSec)throw Error('NO_PRE_DAY_BLOCK');
  let low=0n,high=asOfBlock;
  // Binary search for first block at or after the current UTC midnight.
  while(low+1n<high){
    const mid=(low+high)/2n;
    const block=await getBlock(mid);
    if(block.timestampSec<utcDayStartSec)low=mid;
    else high=mid;
  }
  const baseline=await getBlock(low);
  const next=await getBlock(low+1n);
  if(baseline.timestampSec>=utcDayStartSec||next.timestampSec<utcDayStartSec||
    next.timestampSec<baseline.timestampSec)throw Error('INVALID_BOUNDARY');
  const headAgain=await getBlock(asOfBlock);
  const baselineAgain=await getBlock(low);
  const nextAgain=await getBlock(low+1n);
  if(head.hash!==headAgain.hash||baseline.hash!==baselineAgain.hash||next.hash!==nextAgain.hash)throw Error('REORG_DETECTED');
  return Object.freeze({asOfBlock,utcDayStartSec,baselineBlockNumber:low,
    baselineHash:baseline.hash,baselineTimestampSec:baseline.timestampSec,
    nextBlockNumber:low+1n,nextHash:next.hash,nextTimestampSec:next.timestampSec,
    riskExecutable:false as const});
}
