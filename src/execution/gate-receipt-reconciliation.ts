/** Receipt evidence for bot-submitted Gate.submit(Order).
 *
 * This is deliberately separate from direct-owner transaction evidence.
 * An OrderForwarded event confirms forwarding only; exchange order state is
 * checked independently and even that is NOT evidence of a fill.
 *
 * Trust boundary: expectedRuntimeCodeHash must be anchored to an independently
 * audited/deployed Gate artifact, and hashEventSignature must implement Keccak-256.
 * Arbitrary caller-provided values are not an ABI attestation.
 */
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const MAX64=(1n<<64n)-1n;
const MAX128=(1n<<128n)-1n;
const MAX256=(1n<<256n)-1n;
const EVENT='OrderForwarded(address,uint64,uint256,uint256,uint128)';
type Address=`0x${string}`;
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const addrWord=(address:string)=>'0x'+address.slice(2).toLowerCase().padStart(64,'0');

export interface GateReceiptReconciliationPort {
  getChainId():Promise<number>;
  getTransactionReceipt(hash:Address):Promise<unknown>;
  getBlockHash(blockNumber:bigint):Promise<string>;
  /** Must be a cryptographic hash of runtime bytecode at the receipt block. */
  getGateRuntimeCodeHash(gate:Address,blockNumber:bigint):Promise<string>;
  /** Read the deployed gate's immutable owner at the receipt block. */
  getGateTradingOwner(gate:Address,blockNumber:bigint):Promise<string>;
  /** Keccak-256 of the canonical event signature; not SHA3-256. */
  hashEventSignature(signature:string):string;
  /** Independent exchange state lookup, pinned at least to the receipt block. */
  getExchangeOrder(request:{pool:Address;owner:Address;orderId:bigint;atBlock:bigint}):Promise<unknown>;
}

export interface GateReceiptRequest {
  chainId:number;transactionHash:string;bot:string;owner:string;gate:string;pool:string;
  nonce:bigint;proposedQuantity:bigint;expectedRuntimeCodeHash:string;
}

export async function verifyGateReceiptEvidence(port:GateReceiptReconciliationPort,request:GateReceiptRequest){
  if(request?.chainId!==50383||![request.transactionHash,request.expectedRuntimeCodeHash].every(x=>typeof x==='string'&&HASH.test(x))||
    ![request.bot,request.owner,request.gate,request.pool].every(x=>typeof x==='string'&&ADDRESS.test(x))||
    same(request.bot,request.owner)||typeof request.nonce!=='bigint'||request.nonce<0n||request.nonce>MAX64||
    typeof request.proposedQuantity!=='bigint'||request.proposedQuantity<=0n||request.proposedQuantity>MAX256){
    throw Error('GATE_RECEIPT_INPUT_INVALID');
  }
  if(await port.getChainId()!==50383)throw Error('GATE_RECEIPT_WRONG_CHAIN');
  const raw=await port.getTransactionReceipt(request.transactionHash as Address);
  if(!raw||typeof raw!=='object')throw Error('GATE_RECEIPT_NOT_VERIFIED');
  const r=raw as Record<string,unknown>;
  if(typeof r.transactionHash!=='string'||!HASH.test(r.transactionHash)||!same(r.transactionHash,request.transactionHash))throw Error('GATE_RECEIPT_HASH_MISMATCH');
  if(typeof r.from!=='string'||!ADDRESS.test(r.from)||!same(r.from,request.bot))throw Error('GATE_RECEIPT_SENDER_MISMATCH');
  if(typeof r.to!=='string'||!ADDRESS.test(r.to)||!same(r.to,request.gate))throw Error('GATE_RECEIPT_DESTINATION_MISMATCH');
  if(![1,1n,'success'].includes(r.status as number)||typeof r.blockNumber!=='bigint'||r.blockNumber<=0n||
    typeof r.blockHash!=='string'||!HASH.test(r.blockHash)||!Array.isArray(r.logs))throw Error('GATE_RECEIPT_NOT_VERIFIED');
  const blockNumber=r.blockNumber;
  if(!same(await port.getBlockHash(blockNumber),r.blockHash))throw Error('GATE_REORG_DETECTED');
  const deployedHash=await port.getGateRuntimeCodeHash(request.gate as Address,blockNumber);
  const owner=await port.getGateTradingOwner(request.gate as Address,blockNumber);
  if(!HASH.test(deployedHash)||!same(deployedHash,request.expectedRuntimeCodeHash)||
    !ADDRESS.test(owner)||!same(owner,request.owner))throw Error('GATE_ABI_NOT_ATTESTED');
  const topic=port.hashEventSignature(EVENT);
  if(!HASH.test(topic))throw Error('GATE_ABI_NOT_ATTESTED');
  // This submit entrypoint emits exactly one Gate event; additional unknown
  // Gate logs could indicate a changed implementation or an ABI mismatch.
  const gateLogs=(r.logs as unknown[]).filter(item=>{
    if(!item||typeof item!=='object')return false;
    const address=(item as Record<string,unknown>).address;
    return typeof address==='string'&&ADDRESS.test(address)&&same(address,request.gate);
  });
  if(gateLogs.length!==1)throw Error('ORDER_FORWARDED_NOT_VERIFIED');
  const forwarded=(r.logs as unknown[]).filter(item=>{
    if(!item||typeof item!=='object')return false;
    const l=item as Record<string,unknown>;
    return typeof l.address==='string'&&ADDRESS.test(l.address)&&same(l.address,request.gate)&&
      Array.isArray(l.topics)&&typeof l.topics[0]==='string'&&same(l.topics[0],topic);
  });
  if(forwarded.length!==1)throw Error('ORDER_FORWARDED_NOT_VERIFIED');
  const log=forwarded[0] as Record<string,unknown>;
  const topics=log.topics as unknown[];
  if(topics.length!==3||topics.some(x=>typeof x!=='string'||!HASH.test(x))||
    !same(topics[1] as string,addrWord(request.pool))||BigInt(topics[2] as string)!==request.nonce||
    typeof log.data!=='string'||!/^0x[0-9a-fA-F]{192}$/.test(log.data)||log.removed===true){
    throw Error('ORDER_FORWARDED_NOT_VERIFIED');
  }
  const proposed=BigInt('0x'+log.data.slice(2,66));
  const sent=BigInt('0x'+log.data.slice(66,130));
  const id=BigInt('0x'+log.data.slice(130,194));
  if(proposed!==request.proposedQuantity||sent<=0n||sent>proposed||id===0n||id>MAX128||
    (typeof log.logIndex!=='number'||!Number.isSafeInteger(log.logIndex)||log.logIndex<0))throw Error('ORDER_FORWARDED_NOT_VERIFIED');
  const exchange=await port.getExchangeOrder({pool:request.pool as Address,owner:request.owner as Address,orderId:id,atBlock:blockNumber});
  if(!exchange||typeof exchange!=='object')throw Error('EXCHANGE_ORDER_NOT_VERIFIED');
  const order=exchange as Record<string,unknown>;
  if(typeof order.owner!=='string'||!ADDRESS.test(order.owner)||!same(order.owner,request.owner)||
    typeof order.pool!=='string'||!ADDRESS.test(order.pool)||!same(order.pool,request.pool)||
    order.orderId!==id||!['open','accepted','partially_filled','filled','cancelled'].includes(order.status as string)){
    throw Error('EXCHANGE_ORDER_NOT_VERIFIED');
  }
  if(!same(await port.getBlockHash(blockNumber),r.blockHash))throw Error('GATE_REORG_DETECTED');
  return Object.freeze({kind:'gate_order_forwarded' as const,chainId:50383 as const,
    transactionHash:request.transactionHash,blockNumber,blockHash:r.blockHash,
    bot:request.bot,tradingOwner:request.owner,gate:request.gate,pool:request.pool,
    nonce:request.nonce,proposedQuantity:proposed,submittedQuantity:sent,orderId:id,
    exchangeOrderObserved:true as const,exchangeOrderStatus:order.status,
    fillConfirmed:false as const,riskExecutable:false as const});
}
