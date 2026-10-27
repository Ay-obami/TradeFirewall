/** Read-only, NON-AUTHORITATIVE PnL report. Unsupported bank events reject.
 * Does not grant permission to trade, even if all reads complete.
 */
import {findUtcDayStartBlock} from './utc-day-boundary.ts';
import {createHistoricalEquityReader} from './historical-equity.ts';
import {collectMarginBankLogs} from './margin-bank-log-collector.ts';
import {decodeKnownBankFlows} from './decode-bank-flows.ts';
import {reconcileDailyEquity} from './daily-equity-reconciliation.ts';

type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
export function createDailyPnlReport(deps:{rpc:Rpc}){
  const equity=createHistoricalEquityReader(deps);
  return Object.freeze({
    async read(input:{account:string;asOfBlock:bigint}){
      const boundary=await findUtcDayStartBlock({rpc:deps.rpc,asOfBlock:input.asOfBlock});
      const baseline=await equity.read({account:input.account,blockNumber:boundary.baselineBlockNumber});
      if(baseline.blockHash!==boundary.baselineHash)throw Error('BASELINE_REORG_DETECTED');
      const current=await equity.read({account:input.account,blockNumber:input.asOfBlock});
      const ledger=await collectMarginBankLogs({rpc:deps.rpc,fromExclusive:baseline.blockNumber,toInclusive:current.blockNumber});
      const events=decodeKnownBankFlows(ledger.logs,input.account);
      const result=reconcileDailyEquity({baseline,current,events,coverage:ledger.coverage});
      return Object.freeze({...result,utcDayStartSec:boundary.utcDayStartSec,
        decodedFlowCount:events.length,rawBankLogCount:ledger.logs.length,
        /** Stronger total-equity accounting still requires separately verified locked collateral. */
        authority:'PROVISIONAL_BANK_FLOW_RECONCILIATION' as const,riskExecutable:false as const});
    },
  });
}
