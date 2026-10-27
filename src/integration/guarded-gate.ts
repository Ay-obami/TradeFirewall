import {createPolicyGuardedExecutor,type PolicyGuardDependencies} from './policy-guard.ts';
import {createGateExecutionPort,type GateExecutionDependencies} from '../execution/gate-execution.ts';
import type {TradeIntent} from '../adapter/guarded-executor.ts';

export interface GuardedGateWorkflowDependencies extends Omit<PolicyGuardDependencies,'submitOrder'>{
  gate:GateExecutionDependencies;
  liveEnabled?:boolean;
  /** Must be supplied by a trusted, independently verified risk-data integration.
   * A caller-generated boolean is not itself evidence and MUST NOT be used in production.
   */
  assertRiskReadiness?:()=>Promise<{
    chainId:number;account:`0x${string}`;
    provenance:'VERIFIED_BLOCK_PINNED_RISK';riskProvenanceVerified:boolean;
  }>;
}

/** Policy approval -> one-use gated order; the only signer is the bot via Gate.submit.
 * This composition does not substitute for a real risk-provenance callback, deployed
 * gate, or the operator permission verified at submission time.
 */
export function createGuardedGateWorkflow(deps:GuardedGateWorkflowDependencies){
  const execution=createGateExecutionPort(deps.gate);
  const guarded=createPolicyGuardedExecutor({readSnapshot:deps.readSnapshot,
    submitOrder:execution.submitOrder,nowMs:deps.nowMs,
    approvalTtlMs:deps.approvalTtlMs,snapshotMaxAgeMs:deps.snapshotMaxAgeMs,
    policy:deps.policy,resolveRisk:deps.resolveRisk});
  return Object.freeze({
    async prepare(intent:TradeIntent){
      await execution.preview(intent);
      return guarded.prepare(intent);
    },
    async dryRun(approvalId:string){
      const result=await guarded.dryRun(approvalId);
      const gateRequest=await execution.preview(result.intent);
      return Object.freeze({...result,gateRequest});
    },
    async executeLive(approvalId:string){
      if(deps.liveEnabled!==true)throw Error('LIVE_EXECUTION_DISABLED');
      if(!deps.assertRiskReadiness)throw Error('LIVE_RISK_READINESS_NOT_VERIFIED');
      const proof=await deps.assertRiskReadiness();
      if(proof?.chainId!==50383||proof.account?.toLowerCase()!==deps.gate.tradingOwner.toLowerCase()||
        proof.provenance!=='VERIFIED_BLOCK_PINNED_RISK'||proof.riskProvenanceVerified!==true)
        throw Error('LIVE_RISK_READINESS_NOT_VERIFIED');
      return guarded.execute(approvalId);
    },
  });
}
