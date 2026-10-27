/** A deliberately narrow viem-compatible adapter for bot-only Gate.submit broadcasts.
 * Signing material belongs to the injected walletClient; it is never handled here.
 */
import {encodeGateSubmitCalldata} from './gate-tx-encoder.ts';
import type {GateOrder} from './gate-execution.ts';

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const TX_HASH=/^0x[0-9a-fA-F]{64}$/;
const HIDEKI_CHAIN_ID=50383;

/** Mirrors TradeFirewallGate.Order and submit(Order calldata o) exactly. */
export const TRADE_FIREWALL_GATE_ABI=[{
  type:'function',name:'submit',stateMutability:'nonpayable',
  inputs:[{name:'o',type:'tuple',components:[
    {name:'pool',type:'address'},
    {name:'isBid',type:'bool'},
    {name:'userData',type:'uint64'},
    {name:'price',type:'uint256'},
    {name:'quantity',type:'uint256'},
    {name:'expireTimestampNs',type:'uint64'},
    {name:'orderType',type:'uint8'},
    {name:'selfMatchingOption',type:'uint8'},
    {name:'builder',type:'address'},
    {name:'builderFeeBpsTimes1k',type:'uint96'},
    {name:'nonce',type:'uint64'},
    {name:'deadline',type:'uint256'},
  ]}],
  outputs:[{name:'orderId',type:'uint128'},{name:'submittedQuantity',type:'uint256'}],
}] as const;

/** An injected viem wallet client's subset, not a credential or private-key factory. */
export interface GateWalletClient {
  readonly chain?:{readonly id:number};
  readonly account?:{readonly address:string};
  writeContract(request:unknown):Promise<unknown>;
}

export function createGateViemWriter(deps:{
  readonly walletClient:GateWalletClient;
  readonly botAddress:string;
  readonly tradingOwner:string;
  readonly gateAddress:string;
}) {
  return async function sendGateOrder(request:{to:string;order:GateOrder}):Promise<{transactionHash:string}>{
    if(deps.walletClient.chain?.id!==HIDEKI_CHAIN_ID)throw Error('WRONG_CHAIN');
    const signer=deps.walletClient.account?.address;
    if(!ADDRESS.test(deps.botAddress)||!ADDRESS.test(deps.tradingOwner)||
       !signer||!ADDRESS.test(signer)||
       signer.toLowerCase()!==deps.botAddress.toLowerCase()||
       signer.toLowerCase()===deps.tradingOwner.toLowerCase()){
      throw Error('BOT_SIGNER_MISMATCH');
    }
    if(!ADDRESS.test(deps.gateAddress)||!ADDRESS.test(request.to)||
       request.to.toLowerCase()!==deps.gateAddress.toLowerCase())throw Error('WRONG_GATE');

    // Validate exact tuple widths and application constraints before broadcasting.
    encodeGateSubmitCalldata(request.order);
    let result:unknown;
    try {
      result=await deps.walletClient.writeContract({
        address:deps.gateAddress,
        abi:TRADE_FIREWALL_GATE_ABI,
        functionName:'submit',
        args:[request.order],
        chain:deps.walletClient.chain,
        account:signer,
      });
    } catch {
      // A client error after send can still have broadcast a transaction; never retry here.
      throw Error('AMBIGUOUS_BROADCAST');
    }
    if(typeof result!=='string'||!TX_HASH.test(result))throw Error('AMBIGUOUS_BROADCAST');
    return {transactionHash:result};
  };
}
