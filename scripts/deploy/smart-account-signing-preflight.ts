/** Inspect Wallet 2 owners and unsigned Safe execution support; NO signing/broadcast. */
import {pathToFileURL} from 'node:url';
import {bootstrapHidekiReadClient} from '../../src/dreamdex-live/live-read.ts';
import {loadInstalledSdk} from '../../src/dreamdex-live/smoke-read.ts';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
export const OWNER='0x4da63430901076bF33Ea7E9EA47CCEb6b5578bA1';
export const BOT='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
export const GATE='0x136843943A4EcA38648adb1578B1835f49FF2402';
type AccountApi={ownersOf(account:string):Promise<{owners:{address:string;kind:string}[];threshold:bigint}>;authorityPath(account:string,signer:string):Promise<unknown>;buildExecution(input:{account:string;signer:string;calls:{chainId:number;to:string;data:`0x${string}`;value:bigint;description:string}[]}):Promise<{signer:string;gasFloor:bigint;typedData:{domain:{chainId:number;verifyingContract:string}}}>};
export async function inspectSigningRoute(api:AccountApi){
 const owners=await api.ownersOf(OWNER);
 if(!owners||!Array.isArray(owners.owners)||typeof owners.threshold!=='bigint'||owners.threshold<=0n||owners.owners.some(o=>!ADDRESS.test(o.address)))throw Error('INVALID_OWNER_SET');
 const direct=owners.owners.some(o=>o.address.toLowerCase()===BOT.toLowerCase());
 const path=await api.authorityPath(OWNER,BOT);
 const signer=owners.owners.find(o=>o.kind==='key')?.address;
 if(!signer)throw Error('NO_DIRECT_KEY_OWNER');
 const unsigned=await api.buildExecution({account:OWNER,signer,calls:[{chainId:50383,to:GATE,data:'0x5c975abb',value:0n,description:'Read-only pause getter to test transaction preparation'}]});
 if(unsigned.signer.toLowerCase()!==signer.toLowerCase()||unsigned.typedData.domain.chainId!==50383||unsigned.typedData.domain.verifyingContract.toLowerCase()!==OWNER.toLowerCase()||unsigned.gasFloor<=0n)throw Error('INVALID_SMART_ACCOUNT_PLAN');
 return {mode:'READ_ONLY_SMART_ACCOUNT_SIGNING_PREFLIGHT',chainId:50383,smartAccount:OWNER,bot:BOT,gate:GATE,owners:owners.owners,threshold:owners.threshold.toString(),botIsDirectOwner:direct,botHasAuthorityPath:path!==null&&path!==undefined,requiredSigner:signer,gasFloor:unsigned.gasFloor.toString(),unsignedSafePlanBuilt:true,signaturePresent:false,transactionBroadcast:false,readyForOwnerWrites:false,blocker:'DREAMDEX_EMBEDDED_OWNER_SIGNING_INTERFACE_NOT_CONNECTED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const api=(bootstrapHidekiReadClient(await loadInstalledSdk()).client as {accounts:AccountApi}).accounts;
 inspectSigningRoute(api).then(x=>console.log(JSON.stringify(x,null,2)),e=>{console.error('Signing preflight failed:',e.message);process.exitCode=1});
}
