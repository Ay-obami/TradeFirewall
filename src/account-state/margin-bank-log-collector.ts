/** Fetch *all* MarginBank logs in contiguous ranges. Raw logs intentionally remain
 * unclassified until verified ABI coverage proves which ones alter equity.
 */
const BANK='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const HASH=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x[0-9a-fA-F]+$/;
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;

export async function collectMarginBankLogs(input:{rpc:Rpc;fromExclusive:bigint;toInclusive:bigint;chunkSize?:bigint}) {
  const {rpc,fromExclusive,toInclusive}=input;
  const chunkSize=input.chunkSize??200n;
  if(typeof fromExclusive!=='bigint'||typeof toInclusive!=='bigint'||fromExclusive<0n||toInclusive<=fromExclusive||
    typeof chunkSize!=='bigint'||chunkSize<1n||chunkSize>2000n)throw Error('INVALID_RANGE');
  if(await rpc('eth_chainId',[])!=='0xc4cf')throw Error('WRONG_CHAIN');
  const getBlock=async(number:bigint)=>{
    const result=await rpc('eth_getBlockByNumber',[`0x${number.toString(16)}`,false]);
    if(!result||typeof result!=='object')throw Error('INVALID_BLOCK_RESPONSE');
    const b=result as Record<string,unknown>;
    if(typeof b.number!=='string'||!HEX.test(b.number)||BigInt(b.number)!==number||
      typeof b.hash!=='string'||!HASH.test(b.hash))throw Error('INVALID_BLOCK_RESPONSE');
    return b.hash.toLowerCase();
  };
  const startHash=await getBlock(fromExclusive);
  const endHash=await getBlock(toInclusive);
  const logs:Array<{blockNumber:bigint;logIndex:number;blockHash:string;transactionHash:string;topics:string[];data:string;address:string}>=[];
  const seen=new Set<string>();
  for(let first=fromExclusive+1n;first<=toInclusive;first+=chunkSize){
    const last=first+chunkSize-1n<toInclusive?first+chunkSize-1n:toInclusive;
    const result=await rpc('eth_getLogs',[{address:BANK,fromBlock:`0x${first.toString(16)}`,toBlock:`0x${last.toString(16)}`}]);
    if(!Array.isArray(result))throw Error('INCOMPLETE_LOG_COVERAGE');
    for(const item of result){
      if(!item||typeof item!=='object')throw Error('MALFORMED_LOG');
      const e=item as Record<string,unknown>;
      if(typeof e.address!=='string'||e.address.toLowerCase()!==BANK.toLowerCase())throw Error('UNEXPECTED_LOG_ADDRESS');
      if(typeof e.blockNumber!=='string'||!HEX.test(e.blockNumber)||
        typeof e.blockHash!=='string'||!HASH.test(e.blockHash)||
        typeof e.transactionHash!=='string'||!HASH.test(e.transactionHash)||
        typeof e.logIndex!=='string'||!HEX.test(e.logIndex)||
        !Array.isArray(e.topics)||!e.topics.every(x=>typeof x==='string'&&HASH.test(x))||
        typeof e.data!=='string'||!/^0x(?:[a-fA-F0-9]{2})*$/.test(e.data)||e.removed!==false)throw Error('MALFORMED_LOG');
      const blockNumber=BigInt(e.blockNumber),idx=BigInt(e.logIndex);
      if(blockNumber<first||blockNumber>last)throw Error('LOG_OUTSIDE_RANGE');
      if(idx>BigInt(Number.MAX_SAFE_INTEGER))throw Error('MALFORMED_LOG');
      const id=`${blockNumber}:${idx}`;
      if(seen.has(id))throw Error('DUPLICATE_LOG');
      seen.add(id);
      logs.push({address:e.address,blockNumber,blockHash:e.blockHash.toLowerCase(),
        transactionHash:e.transactionHash.toLowerCase(),logIndex:Number(idx),
        topics:e.topics as string[],data:e.data});
    }
  }
  if(await getBlock(fromExclusive)!==startHash||await getBlock(toInclusive)!==endHash)throw Error('REORG_DETECTED');
  logs.sort((a,b)=>a.blockNumber<b.blockNumber?-1:a.blockNumber>b.blockNumber?1:a.logIndex-b.logIndex);
  return Object.freeze({marginBank:BANK,fromExclusive,toInclusive,logs:Object.freeze(logs),
    coverage:Object.freeze({complete:true as const,source:'VERIFIED_CHAIN_LOGS' as const}),
    /** This proves complete RPC responses, not complete accounting semantics. */
    riskExecutable:false as const});
}
