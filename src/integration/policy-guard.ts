import {
  createGuardedExecutor,
  type GuardedExecutorDependencies,
  type MarketSnapshot,
  type TradeIntent,
} from '../adapter/guarded-executor.ts';
import { evaluateTrade, type RiskContext, type RiskPolicy } from '../policy/evaluate.ts';

/**
 * A trusted integration provides each market's *verified* decimal conversion,
 * mark-derived USD6 notional, current exposure and account performance.
 * Never compute USD6 from unknown raw decimals or fabricate a fallback quote.
 */
export interface VerifiedRiskQuote {
  marketSymbol: string;
  leverageBps: number;
  slippageBps: number;
  lotSizeRaw: bigint;
  riskContext: RiskContext;
  quoteNotionalUsd6(quantityRaw: bigint): string;
}

export interface PolicyGuardDependencies extends Pick<GuardedExecutorDependencies, 'readSnapshot' | 'submitOrder' | 'nowMs' | 'approvalTtlMs' | 'snapshotMaxAgeMs'> {
  policy: RiskPolicy;
  resolveRisk(intent: TradeIntent, snapshot: MarketSnapshot): Promise<VerifiedRiskQuote> | VerifiedRiskQuote;
}

function quotedUnits(quote: VerifiedRiskQuote, quantity: bigint): bigint {
  const text = quote.quoteNotionalUsd6(quantity);
  if (typeof text !== 'string' || !/^(0|[1-9][0-9]*)$/.test(text)) throw new Error('INVALID_QUOTE');
  const result = BigInt(text);
  if (result <= 0n) throw new Error('INVALID_QUOTE');
  return result;
}

/**
 * Compose independent policy assessment with the one-time approval execution gate.
 * The guard's signer must be exclusive; never give an agent raw signer access.
 *
 * Adapter must produce the quote from on-chain market decimals and validated mark.
 * `reduceOnly` is deliberately false: generic TradeIntent does not express or
 * enforce reduce-only execution semantics, so claiming that exemption is unsafe.
 */
export function createPolicyGuardedExecutor(deps: PolicyGuardDependencies) {
  const clock = deps.nowMs ?? Date.now;
  return createGuardedExecutor({
    readSnapshot: deps.readSnapshot,
    submitOrder: deps.submitOrder,
    nowMs: clock,
    approvalTtlMs: deps.approvalTtlMs,
    snapshotMaxAgeMs: deps.snapshotMaxAgeMs,
    policy: async (intent, snapshot) => {
      const quote = await deps.resolveRisk(intent, snapshot);
      if (!quote || typeof quote.marketSymbol !== 'string' ||
          typeof quote.lotSizeRaw !== 'bigint' || quote.lotSizeRaw <= 0n ||
          intent.quantityRaw % quote.lotSizeRaw !== 0n) throw new Error('INVALID_MARKET_LOT');
      if (!quote.riskContext || quote.riskContext.observedAtMs !== snapshot.observedAtMs) {
        throw new Error('RISK_SNAPSHOT_MISMATCH');
      }

      const asked = quotedUnits(quote, intent.quantityRaw);
      // Clock is controlled by this execution boundary, not supplied by the bot.
      const context: RiskContext = { ...quote.riskContext, nowMs: clock() };
      const decision = evaluateTrade({
        market: quote.marketSymbol,
        side: intent.side,
        notionalUsd6: asked.toString(),
        leverageBps: quote.leverageBps,
        slippageBps: quote.slippageBps,
        reduceOnly: false,
      }, context, deps.policy);

      if (decision.action === 'block') return {
        action: 'block' as const, reason: decision.reasons.join(',') || 'POLICY_DENIED',
      };

      const cap = BigInt(decision.approvedNotionalUsd6);
      if (cap >= asked) return {
        action: 'allow' as const, intent, reason: 'POLICY_ALLOW',
      };

      // Conservative binary search over legal market lots. Never increase size.
      // Pricing conversion is a trusted function; each candidate uses an exact
      // USD6 quote and the highest acceptable lot size is selected.
      let low = 0n;
      let high = intent.quantityRaw / quote.lotSizeRaw;
      while (low < high) {
        const midpoint = (low + high + 1n) / 2n;
        if (quotedUnits(quote, midpoint * quote.lotSizeRaw) <= cap) low = midpoint;
        else high = midpoint - 1n;
      }
      if (low === 0n) return {
        action: 'block' as const, reason: 'BELOW_MIN_LOT',
      };

      const resized = { ...intent, quantityRaw: low * quote.lotSizeRaw };
      if (quotedUnits(quote, resized.quantityRaw) > cap) {
        throw new Error('UNSAFE_RISK_QUOTE');
      }
      return {
        action: 'resize' as const, intent: resized,
        reason: decision.reasons.join(',') || 'POLICY_RESIZE',
      };
    },
  });
}
