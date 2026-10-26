// OFFLINE DEMONSTRATION ONLY. Policy checks mirror the production engine for
// whole-USD inputs, but simulated account state is not sourced from the chain.
export const defaultLimits = Object.freeze({
  markets: ['BTC-PERP', 'ETH-PERP', 'SOL-PERP'],
  maxOrderNotional: 1500,
  maxPositionNotional: 2500,
  maxLeverage: 10,
  maxSlippageBps: 50,
  maxMarkAgeSeconds: 15,
  maxDailyLoss: 300,
});

export function evaluateIntent(intent, limits) {
  const explanations = {
    INVALID_INPUT: 'Missing or invalid risk inputs; no simulated approval is possible.',
    STALE_STATE: 'The simulated account/market snapshot is too old to authorize a trade.',
    MARKET_DENIED: 'This market is outside the allowlist.',
    LEVERAGE_EXCEEDED: 'The requested leverage exceeds policy.',
    SLIPPAGE_EXCEEDED: 'Slippage tolerance exceeds policy.',
    DAILY_LOSS_EXCEEDED: 'The daily realized loss cap has been exceeded.',
    ORDER_CAP: 'Requested order was reduced to the permitted order limit.',
    POSITION_CAP: 'The remaining position exposure capacity limits this order.',
    POLICY_PASS: 'The supplied simulated account state passed every policy check.',
  };
  const output = (decision, reasons = [], approvedNotional = 0) => {
    const reason = reasons[0] ?? 'POLICY_PASS';
    return { decision, reason, reasons, approvedNotional, explanation: explanations[reason] };
  };
  const required = ['notional', 'leverage', 'slippageBps', 'markAgeSeconds', 'dailyLoss', 'positionNotional', 'equity'];
  const caps = ['maxOrderNotional', 'maxPositionNotional', 'maxLeverage', 'maxSlippageBps', 'maxMarkAgeSeconds', 'maxDailyLoss'];
  if (!intent || !limits || !Array.isArray(limits.markets) ||
      required.some(key => !Number.isSafeInteger(intent[key])) ||
      caps.some(key => !Number.isSafeInteger(limits[key])) ||
      !['LONG', 'SHORT'].includes(intent.side) || typeof intent.market !== 'string' ||
      intent.notional <= 0 || intent.leverage <= 0 || intent.slippageBps < 0 ||
      intent.markAgeSeconds < 0 || intent.dailyLoss < 0 || intent.equity <= 0 ||
      limits.maxOrderNotional <= 0 || limits.maxPositionNotional <= 0 || limits.maxLeverage <= 0 ||
      limits.maxSlippageBps < 0 || limits.maxMarkAgeSeconds < 0 || limits.maxDailyLoss <= 0) {
    return output('BLOCK', ['INVALID_INPUT']);
  }
  if (intent.markAgeSeconds > limits.maxMarkAgeSeconds) return output('BLOCK', ['STALE_STATE']);
  if (!limits.markets.includes(intent.market)) return output('BLOCK', ['MARKET_DENIED']);
  if (intent.leverage > limits.maxLeverage) return output('BLOCK', ['LEVERAGE_EXCEEDED']);
  if (intent.slippageBps > limits.maxSlippageBps) return output('BLOCK', ['SLIPPAGE_EXCEEDED']);
  if (intent.dailyLoss > limits.maxDailyLoss) return output('BLOCK', ['DAILY_LOSS_EXCEEDED']);

  let approved = BigInt(intent.notional);
  const direction = intent.side === 'LONG' ? 1n : -1n;
  const remainingPositionCapacity = BigInt(limits.maxPositionNotional) - direction * BigInt(intent.positionNotional);
  const reasons = [];
  if (approved > BigInt(limits.maxOrderNotional)) {
    approved = BigInt(limits.maxOrderNotional);
    reasons.push('ORDER_CAP');
  }
  if (approved > remainingPositionCapacity) {
    approved = remainingPositionCapacity;
    reasons.push('POSITION_CAP');
  }
  if (approved <= 0n) return output('BLOCK', reasons.length ? reasons : ['POSITION_CAP']);
  if (approved < BigInt(intent.notional)) return output('RESIZE', reasons, Number(approved));
  return output('ALLOW', [], intent.notional);
}
