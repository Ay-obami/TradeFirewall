/** Provisional daily PnL from total equity (unlocked SDK equity + locked margin).
 * Internal collateral lock/unlock events must NOT be adjusted a second time.
 * This deliberately grants no trading permission and does not convert token units to USD.
 */
import {findUtcDayStartBlock} from './utc-day-boundary.ts';
import {createTotalEconomicEquityReader} from './total-economic-equity.ts';
import {collectMarginBankLogs} from './margin-bank-log-collector.ts';
import {decodeKnownBankFlows} from './decode-bank-flows.ts';
import {classifyBankEvent} from './bank-event-classification.ts';
import {reconcileDailyEquity} from './daily-equity-reconciliation.ts';

type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
type ReadMarginEquity=(marginBank:string,account:string,at:bigint)=>Promise<unknown>;

export function createDailyTotalPnlReport(deps:{rpc:Rpc;readMarginEquity:ReadMarginEquity}){
  const reader=createTotalEconomicEquityReader(deps);
  return Object.freeze({
    async read(input:{account:string;asOfBlock:bigint}){
      const boundary=await findUtcDayStartBlock({rpc:deps.rpc,asOfBlock:input.asOfBlock});
      const baseline=await reader.read({account:input.account,blockNumber:boundary.baselineBlockNumber});
      if(baseline.blockHash!==boundary.baselineHash)throw Error('BASELINE_REORG_DETECTED');
      const current=await reader.read({account:input.account,blockNumber:input.asOfBlock});
      const ledger=await collectMarginBankLogs({rpc:deps.rpc,fromExclusive:baseline.blockNumber,toInclusive:current.blockNumber});
      const events=decodeKnownBankFlows(ledger.logs,input.account);
      const externalFlows=events.filter(event=>{
        // Decoding a bank event proves its wire layout, not its economic meaning.
        // Omitted voucher/repayment events may represent trading or funding and
        // must never silently masquerade as capital moving across the boundary.
        let classification:ReturnType<typeof classifyBankEvent>;
        try {classification=classifyBankEvent(event.kind);}
        catch {throw Error('UNVERIFIED_EXTERNAL_FLOW_SEMANTICS');}
        if(event.kind==='PositionTransferred')throw Error('UNVERIFIED_POSITION_TRANSFER_SEMANTICS');
        return classification.category==='external_transfer';
      });
      const reconciliation=reconcileDailyEquity({
        baseline:{account:baseline.account,blockNumber:baseline.blockNumber,timestampSec:baseline.timestampSec,equityRaw:baseline.totalEconomicEquityRaw},
        current:{account:current.account,blockNumber:current.blockNumber,timestampSec:current.timestampSec,equityRaw:current.totalEconomicEquityRaw},
        events:externalFlows,coverage:ledger.coverage,
      });
      return Object.freeze({...reconciliation,
        utcDayStartSec:boundary.utcDayStartSec,
        totalEconomicEquityStartRaw:baseline.totalEconomicEquityRaw,
        totalEconomicEquityEndRaw:current.totalEconomicEquityRaw,
        excludedInternalMarginMoveCount:events.length-externalFlows.length,
        decodedFlowCount:events.length,rawBankLogCount:ledger.logs.length,
        externalFlowReceipt:Object.freeze({
          complete:false as const,
          bankLogsRetrieved:ledger.coverage.complete,
          classifiedExternalTransferCount:externalFlows.length,
          crossBoundaryCoverageProven:false as const,
          // An exhaustive bank-log scan does not establish all external equity
          // paths, including position transfers and contracts outside the bank.
          missingProof:'EXHAUSTIVE_CROSS_BOUNDARY_EQUITY_FLOW_RECEIPTS' as const,
        }),
        collateralUnits:'RAW_UNVERIFIED_QUOTE' as const,
        authority:'PROVISIONAL_BLOCK_PINNED_TOTAL_EQUITY' as const,
        riskExecutable:false as const,
      });
    },
  });
}
