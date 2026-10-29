import {pathToFileURL} from 'node:url';
import {HIDEKI_RPC} from './preflight.ts';

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const word=(v:string)=>v.slice(2).toLowerCase().padStart(64,'0');
const SELECTOR='80054449'.padEnd(64,'0');
type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
export function createOperatorPathAudit(rpc:Rpc){
 return async(input:{owner:string;bot:string;pool:string;gate?:string})=>{
  for(const [k,v] of Object.entries(input))if(!ADDRESS.test(v))throw Error(`INVALID_${k.toUpperCase()}_ADDRESS`);
  if(input.owner.toLowerCase()===input.bot.toLowerCase())throw Error('OWNER_BOT_ROLE_COLLISION');
  const chain=await rpc('eth_chainId',[]);
  if(chain!=='0xc4cf')throw Error('WRONG_CHAIN');
  const number=await rpc('eth_blockNumber',[]);
  if(typeof number!=='string'||!/^0x[0-9a-fA-F]+$/.test(number))throw Error('INVALID_BLOCK');
  const readBlock=async()=>{
   const b=await rpc('eth_getBlockByNumber',[number,false]) as {hash?:unknown;number?:unknown};
   if(!b||!HASH.test(String(b.hash))||BigInt(String(b.number))!==BigInt(number))throw Error('INVALID_BLOCK');
   return String(b.hash).toLowerCase();
  };
  const before=await readBlock();
  const code=await rpc('eth_getCode',[input.pool,number]);
  if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code))throw Error('POOL_CODE_MISSING');
  const check=async(address:string)=>{
   const data='0xa8cb3794'+word(input.owner)+word(address)+SELECTOR;
   const raw=await rpc('eth_call',[{to:input.pool,data},number]);
   if(typeof raw!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(raw)||!['0','1'].includes(BigInt(raw).toString()))throw Error('INVALID_PERMISSION_RESPONSE');
   return BigInt(raw)===1n;
  };
  const botDirectAuthorized=await check(input.bot);
  let gateAuthorized=false,gateDeployed=false;
  if(input.gate){
   const gateCode=await rpc('eth_getCode',[input.gate,number]);
   gateDeployed=typeof gateCode==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(gateCode);
   if(gateDeployed)gateAuthorized=await check(input.gate);
  }
  if(await readBlock()!==before)throw Error('REORG_DETECTED');
  return Object.freeze({mode:'READ_ONLY_OPERATOR_PATH',chainId:50383,blockNumber:BigInt(number).toString(),blockHash:before,
   owner:input.owner,bot:input.bot,pool:input.pool,gate:input.gate??null,botDirectAuthorized,gateDeployed,gateAuthorized,
   gateOnlyPermission:!!input.gate&&gateDeployed&&gateAuthorized&&!botDirectAuthorized,
   readyForTrading:false,reason:botDirectAuthorized?'DIRECT_BOT_BYPASS_PRESENT':!input.gate?'GATE_NOT_SPECIFIED':!gateDeployed?'GATE_NOT_DEPLOYED':!gateAuthorized?'GATE_NOT_AUTHORIZED':'PERMISSION_ONLY_RISK_UNVERIFIED'});
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [owner,bot,pool,gate]=process.argv.slice(2);
 if(!owner||!bot||!pool){process.stderr.write('Usage: node scripts/deploy/audit-operator-path.ts <owner> <bot> <pool> [gate]\n');process.exitCode=2;}
 else {
  let id=0;
  const rpc:Rpc=async(method,params)=>{
   const response=await fetch(HIDEKI_RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('RPC_HTTP_FAILURE');
   const body=await response.json() as {result?:unknown,error?:unknown};
   if(body.error||body.result===undefined)throw Error('RPC_FAILURE');return body.result;
  };
  createOperatorPathAudit(rpc)({owner,bot,pool,gate}).then(v=>console.log(JSON.stringify(v,null,2)),e=>{console.error('Operator audit failed:',e.message);process.exitCode=1;});
 }
}
