import { pathToFileURL } from 'node:url';
import { bootstrapHidekiReadClient } from '../dreamdex-live/live-read.ts';
import { loadInstalledSdk, readHidekiRpcChainId } from '../dreamdex-live/smoke-read.ts';
import { createMarginDiagnostic, type MarginDiagnosticSdk } from './margin-diagnostic.ts';

type Address=`0x${string}`;

/** Public-only SDK account observation; never signs or authorizes a trade. */
export async function runMarginDiagnosticSmoke(input:{
  account:Address; marginBank:Address;
  readChainId?:()=>Promise<number>;
  loadClient?:()=>Promise<MarginDiagnosticSdk>;
}) {
  const loadClient=input.loadClient??(async()=>{
    const sdk=await loadInstalledSdk();
    return bootstrapHidekiReadClient(sdk).client as MarginDiagnosticSdk;
  });
  const diagnostic=createMarginDiagnostic({client:await loadClient(),readChainId:input.readChainId??readHidekiRpcChainId});
  const result=await diagnostic.read({account:input.account,marginBank:input.marginBank});
  return Object.freeze({
    mode:'LIVE_ACCOUNT_READ_ONLY' as const,
    chainId:result.chainId,account:result.account,marginBank:result.marginBank,
    equityRaw:result.equity.toString(),
    unlockedCollateralRaw:result.unlockedCollateralBalance.toString(),
    lockedCollateralRaw:result.lockedCollateral.toString(),
    imReqRaw:result.imReq.toString(),mmReqRaw:result.mmReq.toString(),cmReqRaw:result.cmReq.toString(),
    activePoolCount:result.activePerpPools.length,
    marginStatus:result.marginStatus,
    blockPinScope:result.blockPinScope,
    riskExecutable:false as const,
  });
}

if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [account,marginBank]=process.argv.slice(2) as Address[];
  if (!account||!marginBank) {
    process.stderr.write('Usage: node src/account-state/margin-smoke.ts <public-account-address> <public-margin-bank-address>\n');
    process.exitCode=2;
  } else {
    runMarginDiagnosticSmoke({account,marginBank}).then(
      result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'),
      err=>{process.stderr.write(`Account read failed: ${String(err?.message??err)}\n`);process.exitCode=1;},
    );
  }
}
