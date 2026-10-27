/** Pure local protocol-double, NOT a chain fork, trading permission or transaction sender. */
import {encodeGateSubmitCalldata} from '../execution/gate-tx-encoder.ts';
import type {GateOrder} from '../execution/gate-execution.ts';

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const ZERO='0x0000000000000000000000000000000000000000';
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const UINT64=(1n<<64n)-1n;

type BaseAction={from:string;atSec:bigint};
type Action=
  |(BaseAction&{kind:'deploy'})
  |(BaseAction&{kind:'configure';pool:string;maxQuantityRaw:bigint;minPriceRaw:bigint;maxPriceRaw:bigint;grossQuantityRaw:bigint})
  |(BaseAction&{kind:'grant';pool:string;operator:string;selector:string;reviewExpiresAtSec:bigint})
  |(BaseAction&{kind:'revoke';pool:string;operator:string;selector:string})
  |(BaseAction&{kind:'queue'|'replace';transactionNonce:bigint;maxFeePerGas:bigint;order:GateOrder})
  |(BaseAction&{kind:'include';transactionNonce:bigint});

type SimInput={chainId:number;administrator:string;bot:string;tradingOwner:string;gateAddress:string;pool:string;actions:readonly Action[]};
const requireAddress=(s:string)=>{
  if(typeof s!=='string'||!ADDRESS.test(s)||same(s,ZERO))throw Error('INVALID_ADDRESS');
};
const nonceKey=(n:bigint)=>{
  if(typeof n!=='bigint'||n<0n||n>UINT64)throw Error('INVALID_TRANSACTION_NONCE');
  return n.toString();
};

/** Actions describe hypothetical transactions and their hypothetical inclusion, with no side effects. */
export function simulateLocalGateLifecycle(input:SimInput){
  if(input.chainId!==50383)throw Error('WRONG_CHAIN');
  for(const address of [input.administrator,input.bot,input.tradingOwner,input.gateAddress,input.pool])requireAddress(address);
  if([input.administrator,input.tradingOwner,input.gateAddress,input.pool].some(a=>same(a,input.bot))||
     same(input.gateAddress,input.pool))throw Error('UNSAFE_ROLE_OR_TARGET');
  let deployed=false,configured=false,approved=false,reviewExpiresAtSec=0n;
  let maxQuantityRaw=0n,minPriceRaw=0n,maxPriceRaw=0n,remainingGrossQuantityRaw=0n;
  let lastTime=-1n;
  const pending=new Map<string,{order:GateOrder;maxFeePerGas:bigint}>();
  const included=new Set<string>();
  const usedOrderNonces=new Set<string>();
  const forwarded:{orderNonce:bigint;transactionNonce:bigint;submittedQuantity:bigint}[]=[];
  for(const action of input.actions){
    if(typeof action.atSec!=='bigint'||action.atSec<0n||action.atSec<lastTime)throw Error('INVALID_SIMULATION_TIME');
    lastTime=action.atSec;
    if(!ADDRESS.test(action.from))throw Error('INVALID_SENDER');
    switch(action.kind){
      case 'deploy':
        if(!same(action.from,input.administrator)||deployed)throw Error('INVALID_DEPLOY');
        deployed=true;
        break;
      case 'configure':
        if(!deployed||!same(action.from,input.administrator)||!same(action.pool,input.pool)||
           action.maxQuantityRaw<=0n||action.minPriceRaw<=0n||action.maxPriceRaw<action.minPriceRaw||
           action.grossQuantityRaw<action.maxQuantityRaw)throw Error('INVALID_CONFIGURE');
        if(!configured)remainingGrossQuantityRaw=action.grossQuantityRaw;
        configured=true;
        maxQuantityRaw=action.maxQuantityRaw;minPriceRaw=action.minPriceRaw;maxPriceRaw=action.maxPriceRaw;
        break;
      case 'grant':
        if(!deployed||!same(action.from,input.tradingOwner)||!same(action.pool,input.pool)||
           action.selector.toLowerCase()!=='0x80054449')throw Error('INVALID_GRANT');
        if(same(action.operator,input.bot))throw Error('DIRECT_BOT_OPERATOR_BYPASS');
        if(!same(action.operator,input.gateAddress)||action.reviewExpiresAtSec<=action.atSec)
          throw Error('INVALID_GRANT_REVIEW');
        approved=true;reviewExpiresAtSec=action.reviewExpiresAtSec;
        break;
      case 'revoke':
        if(!same(action.from,input.tradingOwner)||!same(action.operator,input.gateAddress)||
           !same(action.pool,input.pool)||action.selector.toLowerCase()!=='0x80054449')throw Error('INVALID_REVOKE');
        approved=false;
        break;
      case 'queue':
      case 'replace':{
        if(!same(action.from,input.bot))throw Error('NOT_BOT');
        const key=nonceKey(action.transactionNonce);
        if(included.has(key))throw Error('TRANSACTION_NONCE_ALREADY_INCLUDED');
        if(typeof action.maxFeePerGas!=='bigint'||action.maxFeePerGas<=0n)throw Error('INVALID_MAX_FEE');
        encodeGateSubmitCalldata(action.order);
        if(!same(action.order.pool,input.pool))throw Error('WRONG_POOL');
        const earlier=pending.get(key);
        if(action.kind==='queue'&&earlier)throw Error('DUPLICATE_PENDING_TRANSACTION_NONCE');
        if(action.kind==='replace'&&!earlier)throw Error('MISSING_PENDING_TRANSACTION');
        if(earlier&&action.maxFeePerGas<=earlier.maxFeePerGas)throw Error('REPLACEMENT_FEE_NOT_HIGHER');
        pending.set(key,{order:action.order,maxFeePerGas:action.maxFeePerGas});
        break;
      }
      case 'include':{
        if(!same(action.from,input.bot))throw Error('NOT_BOT');
        const key=nonceKey(action.transactionNonce);
        if(included.has(key))throw Error('TRANSACTION_NONCE_ALREADY_INCLUDED');
        const tx=pending.get(key);
        if(!tx)throw Error('NO_PENDING_TRANSACTION');
        if(!deployed||!configured||!approved)throw Error('GATE_OR_PERMISSION_NOT_READY');
        if(action.atSec>=reviewExpiresAtSec)throw Error('APPROVAL_REVIEW_EXPIRED');
        const o=tx.order;
        if(o.deadline<=action.atSec||o.expireTimestampNs<=action.atSec*1_000_000_000n)throw Error('ORDER_EXPIRED');
        if(o.price<minPriceRaw||o.price>maxPriceRaw)throw Error('ORDER_PRICE_OUTSIDE_MARKET');
        const orderKey=o.nonce.toString();
        if(usedOrderNonces.has(orderKey))throw Error('GATE_NONCE_REPLAY');
        if(remainingGrossQuantityRaw===0n)throw Error('MARKET_ALLOWANCE_EXHAUSTED');
        const submittedQuantity=[o.quantity,maxQuantityRaw,remainingGrossQuantityRaw].reduce((a,b)=>a<b?a:b);
        remainingGrossQuantityRaw-=submittedQuantity;
        usedOrderNonces.add(orderKey);
        pending.delete(key);included.add(key);
        forwarded.push(Object.freeze({orderNonce:o.nonce,transactionNonce:action.transactionNonce,submittedQuantity}));
        break;
      }
    }
  }
  return Object.freeze({kind:'LOCAL_SIMULATION_ONLY' as const,readyToBroadcast:false as const,
    botDirectAuthorized:false as const,persistedGateGrantSimulated:approved,
    offchainReviewExpiresAtSec:reviewExpiresAtSec,remainingGrossQuantityRaw,
    forwarded:Object.freeze(forwarded),pendingCount:pending.size});
}
