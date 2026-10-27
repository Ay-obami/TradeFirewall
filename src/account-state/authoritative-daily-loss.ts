/** Fail-closed daily-loss authority boundary.
 *
 * A block-pinned historical equity delta is useful evidence, but the existing
 * MarginBank log collector proves RPC retrieval rather than exhaustive
 * accounting-flow semantics. Likewise the SDK equity is in unverified raw
 * collateral units, not certified USD6. Neither a caller assertion nor an
 * apparently positive PnL can promote these observations into trading authority.
 */
import {createDailyTotalPnlReport} from './daily-total-pnl-report.ts';

type Rpc=(method:string,params:unknown[])=>Promise<unknown>;
type ReadMarginEquity=(marginBank:string,account:string,at:bigint)=>Promise<unknown>;

export function createAuthoritativeDailyLossReader(deps:{rpc:Rpc;readMarginEquity:ReadMarginEquity}) {
  const provisionalReader=createDailyTotalPnlReport(deps);
  return Object.freeze({
    async read(input:{account:string;asOfBlock:bigint}) {
      try {
        const provisional=await provisionalReader.read(input);
        return Object.freeze({
          account:provisional.account,
          asOfBlock:input.asOfBlock,
          status:'UNAVAILABLE' as const,
          authority:'NO_VERIFIED_DAILY_USD_LOSS_AUTHORITY' as const,
          dailyPnlUsd6:null,
          dailyLossUsd6:null,
          riskExecutable:false as const,
          blockers:Object.freeze([
            'UNPROVEN_COMPLETE_EXTERNAL_FLOW_SEMANTICS',
            'UNVERIFIED_COLLATERAL_USD_UNITS',
          ] as const),
          provisional,
        });
      } catch(error) {
        return Object.freeze({
          account:input?.account ?? null,
          asOfBlock:input?.asOfBlock ?? null,
          status:'UNAVAILABLE' as const,
          authority:'NO_VERIFIED_DAILY_USD_LOSS_AUTHORITY' as const,
          dailyPnlUsd6:null,
          dailyLossUsd6:null,
          riskExecutable:false as const,
          blockers:Object.freeze(['PROVISIONAL_RECONCILIATION_FAILED'] as const),
          detail:error instanceof Error?error.message:'UNKNOWN_EVIDENCE_FAILURE',
          provisional:null,
        });
      }
    },
  });
}
