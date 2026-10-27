import type {PerpsExecutionPort,TradeIntent} from '../adapter/guarded-executor.ts';

/** A signer-isolated execution port for TradeFirewallGate.submit(Order).
 * Inject only a narrowly scoped bot signer, never expose it to the strategy.
 * This module does not create an authorization proof or enable live trading.
 */
type Address=`0x${string}`;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const MAX64=(1n<<64n)-1n;
const ZERO='0x0000000000000000000000000000000000000000' as Address;
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();

export type GateOrder=Readonly<{
  pool:Address;isBid:boolean;userData:bigint;price:bigint;quantity:bigint;
  expireTimestampNs:bigint;orderType:number;selfMatchingOption:number;
  builder:Address;builderFeeBpsTimes1k:bigint;nonce:bigint;deadline:bigint;
}>;

export interface GateExecutionDependencies {
  readonly chainId:number;
  readonly botWalletAddress:Address;
  readonly tradingOwner:Address;
  readonly gateAddress:Address;
  nowMs?:()=>number;
  lookupMarket(pool:Address):Promise<{
    chainId:number;pool:Address;tickSize:bigint;lotSize:bigint;
    minQuantity:bigint;maxQuantity:bigint;minPriceRaw:bigint;maxPriceRaw:bigint;
  } | undefined>;
  /** Fields must originate from verified exchange and local anti-replay metadata. */
  resolveOrderFields(intent:TradeIntent):Promise<{
    userData:bigint;expireTimestampNs:bigint;nonce:bigint;deadlineSec:bigint;
    orderType:number;selfMatchingOption:number;
  }>;
  /** Chain reads must authenticate the deployed gate configuration and market allowlist. */
  readGateState():Promise<{
    chainId:number;address:Address;bot:Address;tradingOwner:Address;
    paused:boolean;contractDeployed:boolean;marketEnabled:boolean;operatorAuthorized:boolean;
  }>;
  /** Only the bot address may sign and submit Gate.submit(Order). */
  sendGateOrder(request:{to:Address;order:GateOrder}):Promise<unknown>;
}

export function createGateExecutionPort(deps:GateExecutionDependencies):PerpsExecutionPort & {
  preview(intent:TradeIntent):Promise<{to:Address;order:GateOrder}>;
}{
  const reservedIntents=new Set<string>();
  const reservedNonces=new Set<string>();
  const nowMs=deps.nowMs??Date.now;

  async function preview(intent:TradeIntent){
    if(deps.chainId!==50383)throw Error('WRONG_CHAIN');
    if(!ADDRESS.test(deps.botWalletAddress)||!ADDRESS.test(deps.gateAddress)||
       !ADDRESS.test(deps.tradingOwner)||same(deps.botWalletAddress,deps.tradingOwner))throw Error('INVALID_GATE_IDENTITY');
    if(!ADDRESS.test(intent.account)||!same(intent.account,deps.tradingOwner))throw Error('TRADING_OWNER_MISMATCH');
    if(!ADDRESS.test(intent.market))throw Error('INVALID_MARKET');
    if(intent.orderType!=='limit')throw Error('UNSUPPORTED_ORDER_TYPE');
    if(intent.side!=='buy'&&intent.side!=='sell')throw Error('INVALID_ORDER_SIDE');
    if(typeof intent.priceRaw!=='bigint'||typeof intent.quantityRaw!=='bigint'||
      intent.priceRaw<=0n||intent.quantityRaw<=0n||!intent.clientOrderId?.trim()||
      intent.clientOrderId.length>128)throw Error('INVALID_ORDER');
    const market=await deps.lookupMarket(intent.market);
    if(!market||market.chainId!==50383||!same(market.pool,intent.market)||
      market.tickSize<=0n||market.lotSize<=0n||market.minQuantity<=0n||
      market.maxQuantity<market.minQuantity||market.minPriceRaw<=0n||
      market.maxPriceRaw<market.minPriceRaw)throw Error('MARKET_NOT_VERIFIED');
    if(intent.priceRaw%market.tickSize!==0n)throw Error('PRICE_NOT_ON_TICK');
    if(intent.quantityRaw%market.lotSize!==0n)throw Error('QUANTITY_NOT_ON_LOT');
    if(intent.quantityRaw<market.minQuantity||intent.quantityRaw>market.maxQuantity||
      intent.priceRaw<market.minPriceRaw||intent.priceRaw>market.maxPriceRaw)throw Error('ORDER_OUTSIDE_MARKET_LIMITS');
    const extra=await deps.resolveOrderFields(intent);
    if(typeof extra.userData!=='bigint'||extra.userData<0n||extra.userData>MAX64||
      typeof extra.nonce!=='bigint'||extra.nonce<0n||extra.nonce>MAX64||
      typeof extra.deadlineSec!=='bigint'||extra.deadlineSec<0n||
      typeof extra.expireTimestampNs!=='bigint'||extra.expireTimestampNs<0n||extra.expireTimestampNs>MAX64||
      !Number.isInteger(extra.orderType)||extra.orderType<0||extra.orderType>3||
      !Number.isInteger(extra.selfMatchingOption)||extra.selfMatchingOption<0||extra.selfMatchingOption>1)throw Error('INVALID_GATE_FIELDS');
    const nowSec=BigInt(Math.floor(nowMs()/1000));
    if(extra.deadlineSec<=nowSec||extra.expireTimestampNs<=nowSec*1_000_000_000n)throw Error('INVALID_ORDER_LIFETIME');
    const order:GateOrder=Object.freeze({pool:intent.market,isBid:intent.side==='buy',
      userData:extra.userData,price:intent.priceRaw,quantity:intent.quantityRaw,
      expireTimestampNs:extra.expireTimestampNs,orderType:extra.orderType,
      selfMatchingOption:extra.selfMatchingOption,builder:ZERO,
      builderFeeBpsTimes1k:0n,nonce:extra.nonce,deadline:extra.deadlineSec});
    return Object.freeze({to:deps.gateAddress,order});
  }

  async function submitOrder(intent:TradeIntent):Promise<{transactionHash:Address}>{
    const key=`${intent.account.toLowerCase()}:${intent.clientOrderId}`;
    if(reservedIntents.has(key))throw Error('DUPLICATE_INTENT');
    reservedIntents.add(key);
    try{
      const prepared=await preview(intent);
      const state=await deps.readGateState();
      if(state.chainId!==50383||!same(state.address,deps.gateAddress)||
        !same(state.bot,deps.botWalletAddress)||!same(state.tradingOwner,deps.tradingOwner)||
        state.paused||!state.contractDeployed||!state.marketEnabled||!state.operatorAuthorized)throw Error('GATE_NOT_READY');
      const nonceKey=prepared.order.nonce.toString();
      if(reservedNonces.has(nonceKey))throw Error('DUPLICATE_NONCE');
      reservedNonces.add(nonceKey);
      let response:unknown;
      try{response=await deps.sendGateOrder(prepared);}catch{throw Error('AMBIGUOUS_BROADCAST');}
      const transactionHash=(response as {transactionHash?:unknown})?.transactionHash;
      if(typeof transactionHash!=='string'||!HASH.test(transactionHash))throw Error('AMBIGUOUS_BROADCAST');
      return {transactionHash:transactionHash as Address};
    }catch(err){
      // A malformed/rejected preview has not broadcast, but the intent stays reserved.
      // Retrying requires explicit reconciliation and a fresh clientOrderId.
      throw err;
    }
  }
  return Object.freeze({preview,submitOrder});
}
