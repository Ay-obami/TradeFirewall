/** Exact unsigned ABI calldata for TradeFirewallGate.submit(Order).
 * Selector 0xa99b37c0 independently verified against Solidity tuple signature
 * submit((address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96,uint64,uint256)).
 * Does not sign, broadcast, approve any order, or prove deployment/permissions.
 */
import type {GateOrder} from './gate-execution.ts';

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const UINT64_MAX=(1n<<64n)-1n;
const UINT256_MAX=(1n<<256n)-1n;
const ZERO='0x0000000000000000000000000000000000000000';

const validInteger=(value:unknown,max:bigint)=>typeof value==='bigint'&&value>=0n&&value<=max;
const validNumber=(value:unknown,max:number)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=max;
const hexWord=(value:bigint)=>value.toString(16).padStart(64,'0');
const addressWord=(value:string)=>value.slice(2).toLowerCase().padStart(64,'0');

export function encodeGateSubmitCalldata(order:GateOrder):`0x${string}` {
  if(!order||!ADDRESS.test(order.pool)||!ADDRESS.test(order.builder)||
     typeof order.isBid!=='boolean'||!validInteger(order.userData,UINT64_MAX)||
     !validInteger(order.price,UINT256_MAX)||order.price===0n||
     !validInteger(order.quantity,UINT256_MAX)||order.quantity===0n||
     !validInteger(order.expireTimestampNs,UINT64_MAX)||
     !validNumber(order.orderType,3)||!validNumber(order.selfMatchingOption,1)||
     order.builder.toLowerCase()!==ZERO||!validInteger(order.builderFeeBpsTimes1k,0n)||
     !validInteger(order.nonce,UINT64_MAX)||!validInteger(order.deadline,UINT256_MAX)){
    throw Error('INVALID_GATE_ORDER');
  }
  const fields=[
    addressWord(order.pool),hexWord(order.isBid?1n:0n),hexWord(order.userData),
    hexWord(order.price),hexWord(order.quantity),hexWord(order.expireTimestampNs),
    hexWord(BigInt(order.orderType)),hexWord(BigInt(order.selfMatchingOption)),
    addressWord(order.builder),hexWord(order.builderFeeBpsTimes1k),hexWord(order.nonce),
    hexWord(order.deadline),
  ];
  return `0xa99b37c0${fields.join('')}`;
}

export function buildUnsignedGateTransaction(gateAddress:string,order:GateOrder){
  if(!ADDRESS.test(gateAddress))throw Error('INVALID_GATE_ADDRESS');
  return Object.freeze({to:gateAddress,data:encodeGateSubmitCalldata(order),value:0n});
}
