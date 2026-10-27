/** Read-only pin to audited Hideki MarginBank proxy implementation and runtime.
 * Caller must supply a real Keccak-256 implementation (NOT SHA3-256).
 * A passing attestation never authorizes a live trade by itself.
 */
const BANK='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const IMPL='0x78c989c9c5cd2ed68b4486373c0e4b118c8f1d5c';
const CODEHASH='0xa13b05632ba2719745c4a6ec0651ab454f2cacca9966e585d3175db687bc5c66';
const HASH=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x[0-9a-fA-F]+$/;
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;

export function createMarginBankAbiAttestor(deps:{rpc:Rpc;keccak256:(data:`0x${string}`)=>string}){
  return Object.freeze({
    async read(input:{blockNumber:bigint}){
      if(typeof input?.blockNumber!=='bigint'||input.blockNumber<0n)throw Error('INVALID_BLOCK');
      const chain=await deps.rpc('eth_chainId',[]);
      if(typeof chain!=='string'||!HEX.test(chain)||BigInt(chain)!==50383n)throw Error('WRONG_CHAIN');
      const tag=`0x${input.blockNumber.toString(16)}`;
      const block=async()=>{
        const raw=await deps.rpc('eth_getBlockByNumber',[tag,false]);
        if(!raw||typeof raw!=='object')throw Error('INVALID_BLOCK_RESPONSE');
        const b=raw as Record<string,unknown>;
        if(typeof b.number!=='string'||!HEX.test(b.number)||BigInt(b.number)!==input.blockNumber||
           typeof b.hash!=='string'||!HASH.test(b.hash))throw Error('INVALID_BLOCK_RESPONSE');
        return b.hash.toLowerCase();
      };
      const before=await block();
      const storage=await deps.rpc('eth_getStorageAt',[BANK,SLOT,tag]);
      if(typeof storage!=='string'||!HASH.test(storage)||!/^0x0{24}[0-9a-fA-F]{40}$/i.test(storage))throw Error('INVALID_IMPLEMENTATION_SLOT');
      const implementation='0x'+storage.slice(-40).toLowerCase();
      if(implementation!==IMPL)throw Error('IMPLEMENTATION_MISMATCH');
      const code=await deps.rpc('eth_getCode',[IMPL,tag]);
      if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code))throw Error('INVALID_IMPLEMENTATION_CODE');
      const codeHash=deps.keccak256(code as `0x${string}`);
      if(typeof codeHash!=='string'||!HASH.test(codeHash)||codeHash.toLowerCase()!==CODEHASH)throw Error('CODEHASH_MISMATCH');
      if(await block()!==before)throw Error('REORG_DETECTED');
      return Object.freeze({marginBank:BANK,implementation:IMPL,codeHash:CODEHASH,
        blockNumber:input.blockNumber,blockHash:before,chainId:50383 as const,
        authority:'DEPLOYED_MARGIN_BANK_ABI_ATTESTATION' as const,riskExecutable:false as const});
    },
  });
}
