/** Public funded-day diagnostics, intentionally no signer and no order sending. */
import {pathToFileURL} from 'node:url';
import {runDeploymentPreflight,HIDEKI_OPERATOR_REGISTRY,HIDEKI_RPC} from './preflight.ts';
import {createOperatorPathAudit} from './audit-operator-path.ts';
import {runMarginDiagnosticSmoke} from '../../src/account-state/margin-smoke.ts';
import {bootstrapHidekiReadClient} from '../../src/dreamdex-live/live-read.ts';
import {loadInstalledSdk} from '../../src/dreamdex-live/smoke-read.ts';
import {readPerpsMarkDiagnostic} from '../../src/integration/perps-mark-diagnostic.ts';
const BANK='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
let rpcId=0;
const allowed=new Set(['eth_chainId','eth_getBalance','eth_getCode','eth_blockNumber','eth_getBlockByNumber','eth_call']);
const rpc=async(method:string,params:any[])=>{
 if(!allowed.has(method))throw Error('READ_ONLY_METHOD_REQUIRED');
 const response=await fetch(HIDEKI_RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('RPC_HTTP_FAILURE');
 const body=await response.json();
 if(body.error||body.result===undefined)throw Error('RPC_RESULT_FAILURE');
 return body.result;
};
export async function fundedReadiness(input:{owner:string;bot:string;pool:string;gate?:string}) {
 const preflight=await runDeploymentPreflight({rpc,wallet:input.bot,pool:input.pool,registry:HIDEKI_OPERATOR_REGISTRY,gate:input.gate});
 const operator=await createOperatorPathAudit(rpc)({owner:input.owner,bot:input.bot,pool:input.pool,gate:input.gate});
 const sdk=bootstrapHidekiReadClient(await loadInstalledSdk()).client as any;
 const margin=await runMarginDiagnosticSmoke({account:input.owner as `0x${string}`,marginBank:BANK as `0x${string}`,loadClient:async()=>sdk});
 const mark=await readPerpsMarkDiagnostic({client:sdk,pool:input.pool,nowSec:BigInt(Math.floor(Date.now()/1000))});
 const blockers:string[]=[];
 if(!preflight.readyForDeployment)blockers.push(...preflight.blockers);
 if(!operator.gateOnlyPermission)blockers.push(operator.reason);
 if(BigInt(margin.equityRaw)<=0n)blockers.push('OWNER_HAS_NO_USDSO_EQUITY');
 if(!mark.usableAsDiagnostic)blockers.push('MARK_NOT_PRICEABLE');
 blockers.push('NO_ATTESTED_CROSS_READER_POLICY_AND_DAILY_LOSS');
 return {mode:'FUNDED_DAY_READ_ONLY',owner:input.owner,bot:input.bot,pool:input.pool,gasWei:preflight.balanceWei.toString(),marginEquityRaw:margin.equityRaw,marginAsOfBlock:margin.asOfBlock,mark,operator,blockers,readyForTrading:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [owner,bot,pool,gate]=process.argv.slice(2);
 if(!owner||!bot||!pool){console.error('Usage: node scripts/deploy/funded-readiness.ts <owner> <bot> <pool> [gate]');process.exitCode=2;}
 else fundedReadiness({owner,bot,pool,gate}).then(x=>console.log(JSON.stringify(x,null,2)),e=>{console.error('FUNDED_READINESS_UNAVAILABLE:',e instanceof Error?e.message:'UNKNOWN');process.exitCode=1;});
}
