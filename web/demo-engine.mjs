// OFFLINE DEMONSTRATION ONLY. Production risk decisions belong to the separately
// tested policy engine and an exclusive, enforced transaction-signing boundary.
export const defaultLimits = Object.freeze({
  markets: ['BTC-PERP', 'ETH-PERP', 'SOL-PERP'],
  maxOrderNotional: 1500,
  maxLeverage: 10,
  maxSlippageBps: 50,
  maxMarkAgeSeconds: 15,
  maxDailyLoss: 300,
});

export function evaluateIntent(intent, limits) {
  const required = ['notional', 'leverage', 'slippageBps', 'markAgeSeconds', 'dailyLoss'];
  if (!intent || !limits || required.some(key => !Number.isFinite(intent[key])) ||
      !Number.isFinite(limits.maxOrderNotional) || !Number.isFinite(limits.maxLeverage) ||
      !Number.isFinite(limits.maxSlippageBps) || !Number.isFinite(limits.maxMarkAgeSeconds) ||
      !Number.isFinite(limits.maxDailyLoss) ||
      limits.maxOrderNotional <= 0 || limits.maxLeverage <= 0 ||
      limits.maxSlippageBps < 0 || limits.maxMarkAgeSeconds < 0 || limits.maxDailyLoss <= 0 ||
      !Array.isArray(limits.markets)) {
    return { decision: 'BLOCK', reason: 'INVALID_INPUT', explanation: 'Invalid or unavailable risk inputs. Fail closed.', approvedNotional: 0 };
  }
  const checks = [
    [!limits.markets.includes(intent.market), 'MARKET_NOT_ALLOWED', 'This market is outside the allowlist.'],
    [!['LONG', 'SHORT'].includes(intent.side) || intent.notional <= 0 || intent.leverage <= 0 || intent.slippageBps < 0 || intent.markAgeSeconds < 0 || intent.dailyLoss < 0, 'INVALID_INPUT', 'Invalid trade or account data. Fail closed.'],
    [intent.markAgeSeconds > limits.maxMarkAgeSeconds, 'STALE_MARK', 'The price is too old to authorize a trade.'],
    [intent.dailyLoss >= limits.maxDailyLoss, 'DAILY_LOSS_CAP', 'The daily loss limit has been reached.'],
    [intent.leverage > limits.maxLeverage, 'EXCESSIVE_LEVERAGE', 'The requested leverage exceeds the cap.'],
    [intent.slippageBps > limits.maxSlippageBps, 'SLIPPAGE_CAP', 'The slippage tolerance exceeds policy.'],
  ];
  const failed = checks.find(([condition]) => condition);
  if (failed) return { decision: 'BLOCK', reason: failed[1], explanation: failed[2], approvedNotional: 0 };
  if (intent.notional > limits.maxOrderNotional) {
    return { decision: 'RESIZE', reason: 'ORDER_CAP', explanation: 'Trade size reduced to the permitted order limit.', approvedNotional: limits.maxOrderNotional };
  }
  return { decision: 'ALLOW', reason: 'POLICY_PASS', explanation: 'All simulated policy checks passed.', approvedNotional: intent.notional };
}
