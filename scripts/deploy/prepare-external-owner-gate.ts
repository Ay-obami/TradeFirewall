/** Prepare but never submit a replacement Gate for an independently controlled trading owner. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {prepareUnsignedGateDeployment} from './unsigned-plan.ts';
export const EXTERNAL_OWNER='0xF40003d36567478489BcCF1a1fEd094f87EeC9a5';
export const BOT='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
export function planExternalOwnerGate(bytecode:string){
 const plan=prepareUnsignedGateDeployment({chainId:50383,creationBytecode:bytecode,administrator:EXTERNAL_OWNER,bot:BOT,tradingOwner:EXTERNAL_OWNER});
 return Object.freeze({...plan,preconditions:['Verify external owner controls Hideki wallet','Verify collateral acquisition and margin-deposit flow','Require explicit owner signature and new Gate deployment receipt','Configure and keep new Gate paused','Grant new Gate scoped pool access and confirm bot has no direct access','Validate independent risk sources before any order']});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const artifact=JSON.parse(readFileSync('out/TradeFirewallGate.sol/TradeFirewallGate.json','utf8'));
 const plan=planExternalOwnerGate(artifact.bytecode.object);
 console.log(JSON.stringify({mode:plan.kind,chainId:plan.chainId,administrator:plan.administrator,bot:plan.bot,tradingOwner:plan.tradingOwner,creationDataBytes:(plan.data.length-2)/2,readyToBroadcast:plan.readyToBroadcast,preconditions:plan.preconditions},null,2));
}
