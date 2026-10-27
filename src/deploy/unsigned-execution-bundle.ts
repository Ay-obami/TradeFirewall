/** Non-signing Hideki planning artifact; none of these bytes authorize live execution. */
import {prepareUnsignedGateDeployment} from '../../scripts/deploy/unsigned-plan.ts';
import {encodeGateSubmitCalldata} from '../execution/gate-tx-encoder.ts';
import type {GateOrder} from '../execution/gate-execution.ts';

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const ZERO='0x0000000000000000000000000000000000000000';
const VERIFIED_HIDEKI_PERPS_REGISTRY='0x6B2FbfeD328FF5F20C0BE7D3C3437613aFFE8D3a';
const UINT256=(1n<<256n)-1n;
const UINT64=(1n<<64n)-1n;
const WORD=(n:bigint)=>n.toString(16).padStart(64,'0');
const ADDRESS_WORD=(a:string)=>a.slice(2).toLowerCase().padStart(64,'0');
const OPERATOR_SELECTOR='80054449'; // placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)
const PERMISSION_CHECK='0xa8cb3794'; // isOperatorAuthorized(address,address,bytes4)

export type UnsignedStage='deploy'|'configure'|'gross-limit'|'grant-gate-only'|'submit';
export type UnsignedTransaction=Readonly<{
  stage:UnsignedStage;from:string;to:string|null;data:string;value:'0x0';
  nonce:bigint|null;gas:bigint|null;gasPrice:bigint|null;
}>;
type BundleInput=Readonly<{
  chainId:number;creationBytecode:string;deployer:string;administrator:string;bot:string;
  tradingOwner:string;gateAddress:string;pool:string;registry:string;
  maxQuantityRaw:bigint;minPriceRaw:bigint;maxPriceRaw:bigint;grossQuantityRaw:bigint;
  nowSec:bigint;order:GateOrder;
}>;
export type UnsignedBundle=Readonly<{
  chainId:50383;readyToBroadcast:false;
  identities:Readonly<{bot:string;tradingOwner:string;pool:string;gateAddress:string}>;
  transactions:readonly UnsignedTransaction[];hardStops:readonly string[];
}>;

function validateAddress(value:string,name:string){
  if(!ADDRESS.test(value)||value.toLowerCase()===ZERO)throw Error(`INVALID_${name.toUpperCase()}`);
}
function positive256(value:bigint){return typeof value==='bigint'&&value>0n&&value<=UINT256;}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();

/** Gate address is an independently verified intended deployment address, NEVER derived from an unchecked nonce. */
export function prepareUnsignedExecutionBundle(input:BundleInput):UnsignedBundle{
  if(input.chainId!==50383)throw Error('WRONG_CHAIN');
  for(const key of ['deployer','administrator','bot','tradingOwner','gateAddress','pool','registry'] as const)
    validateAddress(input[key],key);
  if(!same(input.registry,VERIFIED_HIDEKI_PERPS_REGISTRY))throw Error('UNVERIFIED_OPERATOR_REGISTRY');
  if(same(input.bot,input.deployer)||same(input.bot,input.administrator)||same(input.bot,input.tradingOwner)||
     same(input.bot,input.gateAddress)||same(input.bot,input.registry)||same(input.pool,input.gateAddress)||
     same(input.pool,input.registry)||same(input.tradingOwner,input.gateAddress)||
     same(input.registry,input.gateAddress))throw Error('UNSAFE_ROLE_OR_TARGET');
  if(!positive256(input.maxQuantityRaw)||!positive256(input.minPriceRaw)||
     !positive256(input.maxPriceRaw)||input.maxPriceRaw<input.minPriceRaw||
     !positive256(input.grossQuantityRaw)||input.grossQuantityRaw<input.maxQuantityRaw)throw Error('INVALID_MARKET_LIMITS');
  if(typeof input.nowSec!=='bigint'||input.nowSec<0n||input.nowSec>UINT64)throw Error('INVALID_NOW');
  const o=input.order;
  if(!o||!same(o.pool,input.pool)||typeof o.deadline!=='bigint'||o.deadline<=input.nowSec||
     typeof o.expireTimestampNs!=='bigint'||o.expireTimestampNs<=input.nowSec*1_000_000_000n||
     o.expireTimestampNs>UINT64||o.deadline>UINT256||o.price<input.minPriceRaw||
     o.price>input.maxPriceRaw||o.quantity>input.maxQuantityRaw||o.quantity>input.grossQuantityRaw)
    throw Error('ORDER_OUTSIDE_ENVELOPE');
  const deploy=prepareUnsignedGateDeployment(input);
  const transaction=(stage:UnsignedStage,from:string,to:string|null,data:string):UnsignedTransaction=>
    Object.freeze({stage,from,to,data,value:'0x0' as const,nonce:null,gas:null,gasPrice:null});
  const transactions=[
    transaction('deploy',input.deployer,null,deploy.data),
    transaction('configure',input.administrator,input.gateAddress,
      `0x6983d62b${ADDRESS_WORD(input.pool)}${WORD(input.maxQuantityRaw)}${WORD(input.minPriceRaw)}${WORD(input.maxPriceRaw)}${WORD(1n)}`),
    transaction('gross-limit',input.administrator,input.gateAddress,
      `0x75c4bb62${ADDRESS_WORD(input.pool)}${WORD(input.grossQuantityRaw)}`),
    // Exactly one per-pool capability, granted to the GATE contract (never bot).
    transaction('grant-gate-only',input.tradingOwner,VERIFIED_HIDEKI_PERPS_REGISTRY,
      `0x7bbc67e6${ADDRESS_WORD(input.pool)}${ADDRESS_WORD(input.gateAddress)}${WORD(128n)}${WORD(1n)}${WORD(1n)}${OPERATOR_SELECTOR.padEnd(64,'0')}`),
    transaction('submit',input.bot,input.gateAddress,encodeGateSubmitCalldata(o)),
  ];
  return Object.freeze({chainId:50383 as const,readyToBroadcast:false as const,
    identities:Object.freeze({bot:input.bot,tradingOwner:input.tradingOwner,pool:input.pool,gateAddress:input.gateAddress}),
    transactions:Object.freeze(transactions),hardStops:Object.freeze([
      'VERIFY_DEPLOYED_GATE_ADDRESS_AND_RUNTIME','VERIFY_ADMIN_BOT_OWNER_IMMUTABLES',
      'VERIFY_POOL_AND_REGISTRY_ABI','VERIFY_OWNER_GRANT_TO_GATE_AND_BOT_DIRECT_DENIED',
      'VERIFY_RISK_AND_COLLATERAL_AT_SIGNING','VERIFY_SEQUENTIAL_RECEIPTS_AND_REESTIMATE',
    ])});
}

export type ReadOnlyRpc=(method:string,params:unknown[])=>Promise<unknown>;
function hexQuantity(value:unknown,label:string):bigint{
  if(typeof value!=='string'||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value))throw Error(`INVALID_${label}`);
  return BigInt(value);
}
/** Read-only inspection. Estimates for future-state calls may fail until earlier stages are mined. */
export async function inspectUnsignedBundleGasAndNonces(bundle:UnsignedBundle,rpc:ReadOnlyRpc){
  if(hexQuantity(await rpc('eth_chainId',[]),'CHAIN')!==50383n)throw Error('WRONG_CHAIN');
  const {bot,tradingOwner,pool}=bundle.identities;
  const permissionData=`${PERMISSION_CHECK}${ADDRESS_WORD(tradingOwner)}${ADDRESS_WORD(bot)}${OPERATOR_SELECTOR.padEnd(64,'0')}`;
  const permissionRaw=await rpc('eth_call',[{to:pool,data:permissionData},'latest']);
  if(typeof permissionRaw!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(permissionRaw))throw Error('INVALID_PERMISSION_RESPONSE');
  const permission=BigInt(permissionRaw);
  if(permission!==0n&&permission!==1n)throw Error('INVALID_PERMISSION_RESPONSE');
  if(permission===1n)throw Error('DIRECT_BOT_OPERATOR_BYPASS');
  const nonceByAddress=new Map<string,bigint>();
  const transactions:UnsignedTransaction[]=[];
  let missingEstimate=false;
  for(const t of bundle.transactions){
    const key=t.from.toLowerCase();
    let nonce=nonceByAddress.get(key);
    if(nonce===undefined)nonce=hexQuantity(await rpc('eth_getTransactionCount',[t.from,'pending']),'NONCE_RESPONSE');
    nonceByAddress.set(key,nonce+1n);
    let gas:bigint|null=null;
    try{
      gas=hexQuantity(await rpc('eth_estimateGas',[{from:t.from,to:t.to??undefined,data:t.data,value:t.value}]),'GAS_RESPONSE');
      if(gas===0n)throw Error('ZERO_GAS');
    }catch{missingEstimate=true;}
    transactions.push(Object.freeze({...t,nonce,gas}));
  }
  return Object.freeze({...bundle,transactions:Object.freeze(transactions),
    botDirectOperatorAuthorized:false as const,
    hardStops:Object.freeze([...bundle.hardStops,...(missingEstimate?['GAS_ESTIMATE_UNAVAILABLE']:[])])});
}
