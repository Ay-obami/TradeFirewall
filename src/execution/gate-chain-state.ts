/** Block-pinned, read-only preflight for the deployed TradeFirewallGate operator.
 * Never treats a caller-supplied permission bit as proof of authorization.
 */
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HEX=/^0x[0-9a-fA-F]+$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const MAX64=(1n<<64n)-1n;
const OPERATOR_SELECTOR='80054449'; // placeOrderFor selector as bytes4, right padded
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
const word=(v:string)=>v.slice(2).toLowerCase().padStart(64,'0');
const numberWord=(v:bigint)=>v.toString(16).padStart(64,'0');

export function createGateChainStateReader(input:{rpc:Rpc;gateAddress:string;pool:string;owner:string;bot:string;expectedPoolCodeHash?:string}) {
  const {rpc,gateAddress,pool,owner,bot,expectedPoolCodeHash}=input;
  for(const a of [gateAddress,pool,owner,bot])if(!ADDRESS.test(a))throw Error('INVALID_ADDRESS');
  if(expectedPoolCodeHash!==undefined&&!HASH.test(expectedPoolCodeHash))throw Error('INVALID_POOL_CODE_HASH');

  async function inspect(nonce?:bigint) {
    if(nonce!==undefined&&(typeof nonce!=='bigint'||nonce<0n||nonce>MAX64))throw Error('INVALID_NONCE');
    const chain=await rpc('eth_chainId',[]);
    if(typeof chain!=='string'||!HEX.test(chain)||BigInt(chain)!==50383n)throw Error('WRONG_CHAIN');
    const head=await rpc('eth_blockNumber',[]);
    if(typeof head!=='string'||!HEX.test(head))throw Error('INVALID_BLOCK_RESPONSE');
    const blockNumber=BigInt(head);
    const tag=`0x${blockNumber.toString(16)}`;
    const readBlock=async()=>{
      const item=await rpc('eth_getBlockByNumber',[tag,false]);
      if(!item||typeof item!=='object')throw Error('INVALID_BLOCK_RESPONSE');
      const b=item as Record<string,unknown>;
      if(typeof b.number!=='string'||!HEX.test(b.number)||BigInt(b.number)!==blockNumber||
        typeof b.hash!=='string'||!HASH.test(b.hash))throw Error('INVALID_BLOCK_RESPONSE');
      return b.hash.toLowerCase();
    };
    const before=await readBlock();
    const readCode=async(to:string)=>{
      const code=await rpc('eth_getCode',[to,tag]);
      if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(code))throw Error('INVALID_CODE_RESPONSE');
      return code.length>2&&!/^0x0+$/.test(code);
    };
    const contractDeployed=await readCode(gateAddress);
    const poolDeployed=await readCode(pool);
    let poolCodeHash:string|undefined;
    if(expectedPoolCodeHash!==undefined){
      if(!poolDeployed)throw Error('POOL_CODE_HASH_MISMATCH');
      // EIP-1186 returns the account codeHash at the same pinned block.
      // An RPC without eth_getProof support must fail closed when pinning is requested.
      const proof=await rpc('eth_getProof',[pool,[],tag]);
      if(!proof||typeof proof!=='object'||!HASH.test((proof as {codeHash?:string}).codeHash??''))
        throw Error('INVALID_POOL_CODE_HASH_PROOF');
      poolCodeHash=(proof as {codeHash:string}).codeHash.toLowerCase();
      if(poolCodeHash!==expectedPoolCodeHash.toLowerCase())throw Error('POOL_CODE_HASH_MISMATCH');
    }
    const decode=(raw:unknown)=>{
      if(typeof raw!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(raw))throw Error('INVALID_GATE_RESPONSE');
      return BigInt(raw);
    };
    const readWord=async(to:string,data:string)=>decode(await rpc('eth_call',[{to,data},tag]));
    const readAddress=async(selector:string)=>{
      const value=await readWord(gateAddress,selector);
      if(value>=1n<<160n)throw Error('INVALID_GATE_RESPONSE');
      return `0x${value.toString(16).padStart(40,'0')}`;
    };
    const readBool=async(to:string,data:string)=>{
      const value=await readWord(to,data);
      if(value!==0n&&value!==1n)throw Error('INVALID_GATE_RESPONSE');
      return value===1n;
    };
    if(!contractDeployed){
      if(await readBlock()!==before)throw Error('REORG_DETECTED');
      return Object.freeze({chainId:50383 as const,address:gateAddress,bot,tradingOwner:owner,
        paused:true,contractDeployed:false,marketEnabled:false,operatorAuthorized:false,
        botDirectOperatorAuthorized:false,poolCodeHash,
        blockNumber,blockHash:before,nonceUsed:undefined as boolean|undefined,
        marketLimits:Object.freeze({maxQuantityRaw:0n,minPriceRaw:0n,maxPriceRaw:0n}),
        remainingGrossQuantityRaw:0n,riskExecutable:false as const});
    }
    const gateBot=await readAddress('0x10814c37');
    const tradingOwner=await readAddress('0x18101ea3');
    const paused=await readBool(gateAddress,'0x5c975abb');
    const marketsRaw=await rpc('eth_call',[{to:gateAddress,data:'0x8e8f294b'+word(pool)},tag]);
    if(typeof marketsRaw!=='string'||!/^0x[0-9a-fA-F]{256}$/.test(marketsRaw))throw Error('INVALID_GATE_RESPONSE');
    const enabled=BigInt('0x'+marketsRaw.slice(2,66));
    if(enabled!==0n&&enabled!==1n)throw Error('INVALID_GATE_RESPONSE');
    const maxQuantityRaw=BigInt('0x'+marketsRaw.slice(66,130));
    const minPriceRaw=BigInt('0x'+marketsRaw.slice(130,194));
    const maxPriceRaw=BigInt('0x'+marketsRaw.slice(194,258));
    if(enabled===1n&&(maxQuantityRaw===0n||minPriceRaw===0n||maxPriceRaw<minPriceRaw))throw Error('INVALID_GATE_RESPONSE');
    const gross=await readWord(gateAddress,'0x1ce56593'+word(pool));
    const consumed=await readWord(gateAddress,'0x72c06959'+word(pool));
    if(consumed>gross)throw Error('INVALID_GATE_RESPONSE');
    let operatorAuthorized=false;
    let botDirectOperatorAuthorized=false;
    if(poolDeployed){
      const permissionCall='0xa8cb3794'+word(owner)+word(gateAddress)+OPERATOR_SELECTOR.padEnd(64,'0');
      operatorAuthorized=await readBool(pool,permissionCall);
      const botPermissionCall='0xa8cb3794'+word(owner)+word(bot)+OPERATOR_SELECTOR.padEnd(64,'0');
      botDirectOperatorAuthorized=await readBool(pool,botPermissionCall);
      if(botDirectOperatorAuthorized)throw Error('DIRECT_BOT_OPERATOR_BYPASS');
    }
    const nonceUsed=nonce!==undefined?await readBool(gateAddress,'0x25e44ffe'+numberWord(nonce)):undefined;
    if(await readBlock()!==before)throw Error('REORG_DETECTED');
    return Object.freeze({chainId:50383 as const,address:gateAddress,bot:gateBot,tradingOwner,
      paused,contractDeployed,marketEnabled:enabled===1n,operatorAuthorized,botDirectOperatorAuthorized,
      poolCodeHash,nonceUsed,
      blockNumber,blockHash:before,
      marketLimits:Object.freeze({maxQuantityRaw,minPriceRaw,maxPriceRaw}),
      remainingGrossQuantityRaw:gross-consumed,riskExecutable:false as const});
  }
  return Object.freeze({read:()=>inspect(),readNonce:async(nonce:bigint)=>(await inspect(nonce)).nonceUsed});
}
