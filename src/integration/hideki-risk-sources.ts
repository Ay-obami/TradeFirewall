/** Hideki read-only risk evidence. Supports independently checkable gate state;
 * intentionally refuses to invent mark, policy or daily fiat-loss provenance.
 * No signer, transaction or caller-supplied authorization assertion is accepted.
 */
import type {RiskReadinessScope,RiskReadinessSources} from './verified-risk-readiness.ts';

type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x[0-9a-fA-F]+$/;
const WORD=/^0x[0-9a-fA-F]{64}$/;
const FOUR_WORDS=/^0x[0-9a-fA-F]{256}$/;
const CODE=/^0x(?:[0-9a-fA-F]{2})+$/;
const OPERATOR_SELECTOR='80054449'; // placeOrderFor(bytes4), from audited gate-chain-state reader
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const addrWord=(v:string)=>v.slice(2).toLowerCase().padStart(64,'0');
const denied=(reason:string):never=>{throw Error(reason);};

export function createHidekiRiskSources(input:{rpc:Rpc;gateAddress:string;botAddress:string;
  /** Independently verified exact deployed runtime bytecode, not guessed from getters. */
  expectedGateRuntimeCode:string;expectedPoolRuntimeCode:string;
  nowMs?:()=>number;maxAgeMs?:number}):RiskReadinessSources {
  if(typeof input?.rpc!=='function'||!ADDRESS.test(input.gateAddress)||!ADDRESS.test(input.botAddress))
    denied('INVALID_HIDEKI_CONFIG');
  if(!CODE.test(input.expectedGateRuntimeCode)||!CODE.test(input.expectedPoolRuntimeCode)||
    /^0x0+$/i.test(input.expectedGateRuntimeCode)||/^0x0+$/i.test(input.expectedPoolRuntimeCode))
    denied('INVALID_ATTESTED_RUNTIME_CODE');
  const {rpc,gateAddress,botAddress}=input;
  const gateRuntimeCode=input.expectedGateRuntimeCode.toLowerCase();
  const poolRuntimeCode=input.expectedPoolRuntimeCode.toLowerCase();
  const now=input.nowMs??Date.now;
  const maxAgeMs=input.maxAgeMs??3000;
  if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0)denied('INVALID_MAX_AGE');

  async function chain(){
    const value=await rpc('eth_chainId',[]);
    if(typeof value!=='string'||!HEX.test(value)||BigInt(value)!==50383n)denied('WRONG_CHAIN');
  }
  async function readBlock(number:bigint){
    if(typeof number!=='bigint'||number<0n)denied('INVALID_BLOCK');
    await chain();
    const block=await rpc('eth_getBlockByNumber',[`0x${number.toString(16)}`,false]);
    if(!block||typeof block!=='object')denied('INVALID_BLOCK_RESPONSE');
    const b=block as Record<string,unknown>;
    if(typeof b.number!=='string'||!HEX.test(b.number)||BigInt(b.number)!==number||
      typeof b.hash!=='string'||!HASH.test(b.hash)||typeof b.timestamp!=='string'||!HEX.test(b.timestamp))
      denied('INVALID_BLOCK_RESPONSE');
    const timestamp=BigInt(b.timestamp)*1000n;
    if(timestamp>BigInt(Number.MAX_SAFE_INTEGER))denied('INVALID_BLOCK_TIMESTAMP');
    return {chainId:50383 as const,number,hash:b.hash.toLowerCase() as `0x${string}`,timestampMs:Number(timestamp)};
  }
  function checkScope(scope:RiskReadinessScope){
    const timestamp=now();
    if(scope?.chainId!==50383||!ADDRESS.test(scope.account)||!ADDRESS.test(scope.market)||
      !ADDRESS.test(scope.gateAddress)||!same(scope.gateAddress,gateAddress)||!HASH.test(scope.blockHash)||
      typeof scope.blockNumber!=='bigint'||scope.blockNumber<0n||
      scope.snapshotId!==`${scope.blockNumber}:${scope.blockHash}`||
      typeof scope.markPriceRaw!=='bigint'||scope.markPriceRaw<=0n||
      !Number.isSafeInteger(scope.observedAtMs)||!Number.isSafeInteger(timestamp))denied('INVALID_RISK_SCOPE');
    if(scope.observedAtMs>timestamp||timestamp-scope.observedAtMs>maxAgeMs)denied('STALE_RISK_SCOPE');
  }
  async function checkedBlock(scope:RiskReadinessScope){
    const block=await readBlock(scope.blockNumber);
    if(!same(block.hash,scope.blockHash))denied('BLOCK_HASH_MISMATCH');
    if(block.timestampMs!==scope.observedAtMs)denied('BLOCK_TIMESTAMP_MISMATCH');
  }
  async function readGate(scope:RiskReadinessScope){
    checkScope(scope);
    await checkedBlock(scope);
    const pin={blockHash:scope.blockHash,requireCanonical:true};
    const assertCode=async(to:string,expected:string,label:string)=>{
      const code=await rpc('eth_getCode',[to,pin]);
      if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(code))denied('INVALID_CODE_RESPONSE');
      if(code.toLowerCase()!==expected)denied(`${label}_RUNTIME_CODE_MISMATCH`);
    };
    await assertCode(gateAddress,gateRuntimeCode,'GATE');
    await assertCode(scope.market,poolRuntimeCode,'POOL');
    const call=async(to:string,data:string)=>rpc('eth_call',[{to,data},pin]);
    const word=async(to:string,data:string)=>{
      const raw=await call(to,data);
      if(typeof raw!=='string'||!WORD.test(raw))denied('INVALID_GATE_RESPONSE');
      return BigInt(raw);
    };
    const bool=async(to:string,data:string)=>{
      const raw=await word(to,data);
      if(raw!==0n&&raw!==1n)denied('INVALID_GATE_BOOLEAN');
      return raw===1n;
    };
    const bot=await word(gateAddress,'0x10814c37');
    const owner=await word(gateAddress,'0x18101ea3');
    if(bot>=1n<<160n||owner>=1n<<160n||
      !same(`0x${bot.toString(16).padStart(40,'0')}`,botAddress)||
      !same(`0x${owner.toString(16).padStart(40,'0')}`,scope.account))denied('GATE_IDENTITY_MISMATCH');
    const paused=await bool(gateAddress,'0x5c975abb');
    const raw=await call(gateAddress,'0x8e8f294b'+addrWord(scope.market));
    if(typeof raw!=='string'||!FOUR_WORDS.test(raw))denied('INVALID_MARKET_LIMITS');
    const values=[0,1,2,3].map(i=>BigInt('0x'+raw.slice(2+i*64,66+i*64)));
    if(values[0]!==0n&&values[0]!==1n)denied('INVALID_MARKET_LIMITS');
    if(values[0]===1n&&(values[1]===0n||values[2]===0n||values[3]<values[2]))
      denied('INVALID_MARKET_LIMITS');
    const isApproved=(operator:string)=>bool(scope.market,
      '0xa8cb3794'+addrWord(scope.account)+addrWord(operator)+OPERATOR_SELECTOR.padEnd(64,'0'));
    const operatorAuthorized=await isApproved(gateAddress);
    if(await isApproved(botAddress))denied('DIRECT_BOT_OPERATOR_BYPASS');
    await checkedBlock(scope);
    const completed=now();
    if(!Number.isSafeInteger(completed)||completed<scope.observedAtMs||
      completed-scope.observedAtMs>maxAgeMs)denied('STALE_RISK_SCOPE');
    return Object.freeze({chainId:50383,account:scope.account,market:scope.market,gateAddress,
      blockNumber:scope.blockNumber,blockHash:scope.blockHash,contractDeployed:true,paused,
      marketEnabled:values[0]===1n,operatorAuthorized});
  }
  return Object.freeze({readBlock,readGate,
    readPrice:async(_scope:RiskReadinessScope)=>denied('UNVERIFIED_HIDEKI_MARK_ABI'),
    readPolicy:async(_scope:RiskReadinessScope)=>denied('UNVERIFIED_RISK_POLICY_SOURCE'),
    readDailyLoss:async(_scope:RiskReadinessScope)=>denied('UNVERIFIED_DAILY_USD_LOSS_SOURCE'),
    nowMs:now,maxAgeMs});
}
