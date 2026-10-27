import {createPolicyGuardedExecutor,type PolicyGuardDependencies} from './policy-guard.ts';
import {createGateExecutionPort,type GateExecutionDependencies} from '../execution/gate-execution.ts';
import type {TradeIntent} from '../adapter/guarded-executor.ts';
import type {MarketSnapshot} from '../adapter/guarded-executor.ts';
import {assertVerifiedRiskProof,type RiskReadinessScope,type VerifiedRiskProof} from './verified-risk-readiness.ts';

export interface GuardedGateWorkflowDependencies extends Omit<PolicyGuardDependencies,'submitOrder'>{
  gate:GateExecutionDependencies;
  liveEnabled?:boolean;
  /** This verifier must issue a runtime-authenticated proof from block-pinned sources.
   * A caller-generated object, boolean or provenance string is never accepted.
   */
  assertRiskReadiness?:(scope:RiskReadinessScope)=>Promise<VerifiedRiskProof>;
}

/** Policy approval -> one-use gated order; the only signer is the bot via Gate.submit.
 * This composition does not substitute for a real risk-provenance callback, deployed
 * gate, or the operator permission verified at submission time.
 */
export function createGuardedGateWorkflow(deps:GuardedGateWorkflowDependencies){
  const execution=createGateExecutionPort(deps.gate);
  const lastSnapshots=new Map<string,MarketSnapshot>();
  const preparedSnapshots=new Map<string,MarketSnapshot>();
  const guarded=createPolicyGuardedExecutor({readSnapshot:async intent=>{
    const snapshot=await deps.readSnapshot(intent);
    lastSnapshots.set(intent.account.toLowerCase(),Object.freeze({...snapshot}));
    return snapshot;
  },
    submitOrder:execution.submitOrder,nowMs:deps.nowMs,
    approvalTtlMs:deps.approvalTtlMs,snapshotMaxAgeMs:deps.snapshotMaxAgeMs,
    policy:deps.policy,resolveRisk:deps.resolveRisk});
  return Object.freeze({
    async prepare(intent:TradeIntent){
      await execution.preview(intent);
      const prepared=await guarded.prepare(intent);
      if(prepared.action==='approved'){
        const snapshot=lastSnapshots.get(prepared.intent.account.toLowerCase());
        if(!snapshot)throw Error('LIVE_RISK_READINESS_NOT_VERIFIED');
        preparedSnapshots.set(prepared.approvalId,snapshot);
      }
      return prepared;
    },
    async dryRun(approvalId:string){
      const result=await guarded.dryRun(approvalId);
      const gateRequest=await execution.preview(result.intent);
      return Object.freeze({...result,gateRequest});
    },
    async executeLive(approvalId:string){
      if(deps.liveEnabled!==true)throw Error('LIVE_EXECUTION_DISABLED');
      if(!deps.assertRiskReadiness)throw Error('LIVE_RISK_READINESS_NOT_VERIFIED');
      const snapshot=preparedSnapshots.get(approvalId);
      if(!snapshot)throw Error('LIVE_RISK_READINESS_NOT_VERIFIED');
      preparedSnapshots.delete(approvalId);
      const hash=snapshot.snapshotId.split(':')[1];
      if(!hash||!/^0x[0-9a-fA-F]{64}$/.test(hash)||
        snapshot.account.toLowerCase()!==deps.gate.tradingOwner.toLowerCase())
        throw Error('LIVE_RISK_READINESS_NOT_VERIFIED');
      const scope:RiskReadinessScope={chainId:snapshot.chainId,account:snapshot.account,market:snapshot.market,
        gateAddress:deps.gate.gateAddress,blockNumber:snapshot.blockNumber,blockHash:hash as `0x${string}`,
        observedAtMs:snapshot.observedAtMs,markPriceRaw:snapshot.markPriceRaw,snapshotId:snapshot.snapshotId};
      const proof=await deps.assertRiskReadiness(scope);
      assertVerifiedRiskProof(proof,scope,(deps.nowMs??Date.now)());
      return guarded.execute(approvalId);
    },
  });
}
