export interface RiskPolicy {
  allowedMarkets: string[];
  maxLeverageBps: number;
  maxOrderNotionalUsd6: string;
  maxPositionNotionalUsd6: string;
  maxSlippageBps: number;
  maxDailyLossUsd6: string;
  maxSnapshotAgeMs: number;
}

export interface TradeIntent {
  market: string;
  side: 'buy' | 'sell';
  notionalUsd6: string;
  leverageBps: number;
  slippageBps: number;
  reduceOnly: boolean;
}

export interface RiskContext {
  nowMs: number;
  observedAtMs: number;
  signedPositionUsd6: string;
  dailyPnlUsd6: string;
  equityUsd6: string;
}

export type RiskReason =
  | 'INVALID_INPUT'
  | 'STALE_STATE'
  | 'MARKET_DENIED'
  | 'LEVERAGE_EXCEEDED'
  | 'SLIPPAGE_EXCEEDED'
  | 'DAILY_LOSS_EXCEEDED'
  | 'ORDER_CAP'
  | 'POSITION_CAP'
  | 'REDUCE_ONLY_CAP';

export type RiskDecision = {
  action: 'allow' | 'resize' | 'block';
  approvedNotionalUsd6: string;
  reasons: RiskReason[];
};

const unsignedInteger = /^(0|[1-9][0-9]*)$/;
const signedInteger = /^-?(0|[1-9][0-9]*)$/;

function units(value: unknown, signed = false): bigint | undefined {
  if (typeof value !== 'string' || !(signed ? signedInteger : unsignedInteger).test(value)) return undefined;
  try { return BigInt(value); } catch { return undefined; }
}

function validBps(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function block(reason: RiskReason | RiskReason[]): RiskDecision {
  return { action: 'block', approvedNotionalUsd6: '0', reasons: Array.isArray(reason) ? reason : [reason] };
}

export function evaluateTrade(intent: TradeIntent, context: RiskContext, policy: RiskPolicy): RiskDecision {
  // Treat all runtime inputs as untrusted, regardless of TypeScript annotations.
  try {
    const asked = units(intent?.notionalUsd6);
    const signedPosition = units(context?.signedPositionUsd6, true);
    const pnl = units(context?.dailyPnlUsd6, true);
    const equity = units(context?.equityUsd6);
    const maxOrder = units(policy?.maxOrderNotionalUsd6);
    const maxPosition = units(policy?.maxPositionNotionalUsd6);
    const dailyLoss = units(policy?.maxDailyLossUsd6);
    if (
      asked === undefined || asked <= 0n || signedPosition === undefined || pnl === undefined ||
      equity === undefined || equity <= 0n || maxOrder === undefined || maxOrder <= 0n ||
      maxPosition === undefined || maxPosition <= 0n || dailyLoss === undefined ||
      !Array.isArray(policy.allowedMarkets) || !policy.allowedMarkets.every((market) => typeof market === 'string') ||
      typeof intent.market !== 'string' || (intent.side !== 'buy' && intent.side !== 'sell') ||
      typeof intent.reduceOnly !== 'boolean' ||
      !validBps(intent.leverageBps) || intent.leverageBps === 0 ||
      !validBps(intent.slippageBps) || !validBps(policy.maxLeverageBps) || policy.maxLeverageBps === 0 ||
      !validBps(policy.maxSlippageBps) ||
      !Number.isSafeInteger(context.nowMs) || !Number.isSafeInteger(context.observedAtMs) ||
      !Number.isSafeInteger(policy.maxSnapshotAgeMs) || policy.maxSnapshotAgeMs < 0
    ) return block('INVALID_INPUT');

    if (context.observedAtMs > context.nowMs || context.nowMs - context.observedAtMs > policy.maxSnapshotAgeMs) {
      return block('STALE_STATE');
    }

    const reasons: RiskReason[] = [];
    if (!policy.allowedMarkets.includes(intent.market)) reasons.push('MARKET_DENIED');
    if (intent.leverageBps > policy.maxLeverageBps) reasons.push('LEVERAGE_EXCEEDED');
    if (intent.slippageBps > policy.maxSlippageBps) reasons.push('SLIPPAGE_EXCEEDED');
    if (pnl < -dailyLoss) reasons.push('DAILY_LOSS_EXCEEDED');
    if (reasons.length) return block(reasons);

    let approved = asked;
    if (approved > maxOrder) {
      approved = maxOrder;
      reasons.push('ORDER_CAP');
    }

    const direction = intent.side === 'buy' ? 1n : -1n;
    if (intent.reduceOnly) {
      const reducing = signedPosition * direction < 0n;
      if (!reducing) return block('REDUCE_ONLY_CAP');
      const reducible = signedPosition < 0n ? -signedPosition : signedPosition;
      if (approved > reducible) {
        approved = reducible;
        reasons.push('REDUCE_ONLY_CAP');
      }
    } else {
      const positionCapacity = maxPosition - direction * signedPosition;
      if (approved > positionCapacity) {
        approved = positionCapacity;
        reasons.push('POSITION_CAP');
      }
    }

    if (approved <= 0n) return block(reasons.length ? reasons : 'POSITION_CAP');
    return {
      action: approved === asked ? 'allow' : 'resize',
      approvedNotionalUsd6: approved.toString(),
      reasons,
    };
  } catch {
    // Missing policy/intent/context objects and unexpected getters fail closed.
    return block('INVALID_INPUT');
  }
}
