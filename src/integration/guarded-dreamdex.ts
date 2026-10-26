import { createPolicyGuardedExecutor, type PolicyGuardDependencies } from './policy-guard.ts';
import { createDreamdexExecutionPort, type DreamdexExecutionSdk } from '../execution/sdk-execution.ts';
import type { TradeIntent } from '../adapter/guarded-executor.ts';

export interface GuardedDreamdexWorkflowDependencies extends Omit<PolicyGuardDependencies,'submitOrder'> {
  sdk: DreamdexExecutionSdk;
  /** Explicit opt-in for an independently configured signer; false by default. */
  liveEnabled?: boolean;
}

/**
 * Compose a verified market preview, policy evaluation and one-use approval gate.
 * The SDK signer is never invoked during prepare/dryRun. Live submission remains
 * disabled until the embedding application expressly enables it after funding,
 * operator permission verification and a separate user-approved signing setup.
 */
export function createGuardedDreamdexWorkflow(deps:GuardedDreamdexWorkflowDependencies) {
  const execution=createDreamdexExecutionPort(deps.sdk);
  const guarded=createPolicyGuardedExecutor({
    readSnapshot:deps.readSnapshot,
    submitOrder:execution.submitOrder,
    nowMs:deps.nowMs,
    approvalTtlMs:deps.approvalTtlMs,
    snapshotMaxAgeMs:deps.snapshotMaxAgeMs,
    policy:deps.policy,
    resolveRisk:deps.resolveRisk,
  });

  return Object.freeze({
    async prepare(intent:TradeIntent) {
      // Detect mismatched signer, network, unsupported order types and market
      // unit errors before reserving a guarded approval or reading account data.
      await execution.preview(intent);
      return guarded.prepare(intent);
    },
    async dryRun(approvalId:string) {
      const result=await guarded.dryRun(approvalId);
      const sdkParameters=await execution.preview(result.intent);
      return Object.freeze({...result,sdkParameters});
    },
    async executeLive(approvalId:string) {
      if(deps.liveEnabled!==true) throw new Error('LIVE_EXECUTION_DISABLED');
      return guarded.execute(approvalId);
    },
  });
}
