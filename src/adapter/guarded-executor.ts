import { randomUUID } from 'node:crypto';

/** The only perps chain this MVP can submit to; Shannon (50312) is not supported. */
export const DREAMDEX_HIDEKI_CHAIN_ID = 50383;

export type TradeIntent = Readonly<{
  account: `0x${string}`;
  market: `0x${string}`;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  priceRaw: bigint;
  quantityRaw: bigint;
  clientOrderId: string;
}>;

/** Values are in raw on-chain units. Do not mix decimals or use floating-point arithmetic. */
export type MarketSnapshot = Readonly<{
  chainId: number;
  account: `0x${string}`;
  market: `0x${string}`;
  blockNumber: bigint;
  observedAtMs: number;
  markPriceRaw: bigint;
  availableMarginRaw: bigint;
  currentPositionRaw: bigint;
  snapshotId: string;
}>;

export type PolicyDecision =
  | Readonly<{ action: 'allow' | 'resize'; intent: TradeIntent; reason: string }>
  | Readonly<{ action: 'block'; reason: string }>;

export type PreparedTrade =
  | Readonly<{ action: 'block'; reason: string }>
  | Readonly<{
      action: 'approved';
      approvalId: string;
      intent: TradeIntent;
      reason: string;
      expiresAtMs: number;
    }>;

export interface PerpsReadPort {
  readSnapshot(intent: TradeIntent): Promise<MarketSnapshot>;
}

/** An external adapter owns keys. This module never creates signers or touches secrets. */
export interface PerpsExecutionPort {
  submitOrder(intent: TradeIntent): Promise<{ transactionHash: `0x${string}` }>;
}

export interface GuardedExecutorDependencies extends PerpsReadPort, PerpsExecutionPort {
  policy(intent: TradeIntent, snapshot: MarketSnapshot): Promise<PolicyDecision> | PolicyDecision;
  nowMs?: () => number;
  approvalTtlMs?: number;
  snapshotMaxAgeMs?: number;
}

interface ApprovalRecord {
  readonly intent: TradeIntent;
  readonly snapshot: MarketSnapshot;
  readonly expiryMs: number;
}

function deny(reason: string): never {
  throw new Error(reason);
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function copyTrade(value: TradeIntent): TradeIntent {
  return Object.freeze({ ...value });
}

function checkIntent(value: TradeIntent): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value.account) || !/^0x[0-9a-fA-F]{40}$/.test(value.market)) {
    deny('INVALID_INTENT');
  }
  if (!['buy', 'sell'].includes(value.side) || !['limit', 'market'].includes(value.orderType)) deny('INVALID_INTENT');
  if (typeof value.quantityRaw !== 'bigint' || typeof value.priceRaw !== 'bigint' || value.quantityRaw <= 0n || value.priceRaw <= 0n) {
    deny('INVALID_INTENT');
  }
  if (typeof value.clientOrderId !== 'string' || !value.clientOrderId.trim() || value.clientOrderId.length > 128) {
    deny('INVALID_INTENT');
  }
}

function snapshotValid(snapshot: MarketSnapshot, intent: TradeIntent, nowMs: number, maxAgeMs: number): void {
  if (snapshot.chainId !== DREAMDEX_HIDEKI_CHAIN_ID) deny('WRONG_CHAIN');
  if (!sameAddress(snapshot.account, intent.account) || !sameAddress(snapshot.market, intent.market)) deny('SNAPSHOT_MISMATCH');
  if (!Number.isSafeInteger(snapshot.observedAtMs) || nowMs < snapshot.observedAtMs || nowMs - snapshot.observedAtMs > maxAgeMs) {
    deny('STALE_SNAPSHOT');
  }
  if (typeof snapshot.blockNumber !== 'bigint' || snapshot.blockNumber < 0n ||
    typeof snapshot.markPriceRaw !== 'bigint' || snapshot.markPriceRaw <= 0n ||
    typeof snapshot.availableMarginRaw !== 'bigint' || snapshot.availableMarginRaw < 0n ||
    typeof snapshot.currentPositionRaw !== 'bigint' ||
    !snapshot.snapshotId) deny('INVALID_SNAPSHOT');
}

function snapshotMatches(left: MarketSnapshot, right: MarketSnapshot): boolean {
  return left.chainId === right.chainId &&
    sameAddress(left.account, right.account) &&
    sameAddress(left.market, right.market) &&
    left.blockNumber === right.blockNumber &&
    left.observedAtMs === right.observedAtMs &&
    left.snapshotId === right.snapshotId &&
    left.markPriceRaw === right.markPriceRaw &&
    left.availableMarginRaw === right.availableMarginRaw &&
    left.currentPositionRaw === right.currentPositionRaw;
}

/**
 * An in-process, fail-closed approval gate. The bot must not receive direct access to
 * the underlying execution port or its signing key, or this control can be bypassed.
 *
 * Production deployments must also coordinate approvals across all service replicas.
 */
export function createGuardedExecutor(deps: GuardedExecutorDependencies) {
  const nowMs = deps.nowMs ?? Date.now;
  const approvalTtlMs = deps.approvalTtlMs ?? 15_000;
  const snapshotMaxAgeMs = deps.snapshotMaxAgeMs ?? 3_000;
  if (!Number.isSafeInteger(approvalTtlMs) || approvalTtlMs <= 0 ||
      !Number.isSafeInteger(snapshotMaxAgeMs) || snapshotMaxAgeMs <= 0) deny('INVALID_CONFIGURATION');

  const approvals = new Map<string, ApprovalRecord>();
  const accounts = new Set<string>();
  const executingAccounts = new Set<string>();

  function consume(approvalId: string): ApprovalRecord {
    const record = approvals.get(approvalId);
    if (!record) return deny('INVALID_APPROVAL');
    approvals.delete(approvalId);
    if (nowMs() > record.expiryMs) {
      accounts.delete(record.intent.account.toLowerCase());
      return deny('APPROVAL_EXPIRED');
    }
    executingAccounts.add(record.intent.account.toLowerCase());
    return record;
  }

  function release(account: string): void {
    accounts.delete(account.toLowerCase());
  }

  async function prepare(rawIntent: TradeIntent): Promise<PreparedTrade> {
    checkIntent(rawIntent);
    const intent = copyTrade(rawIntent);
    const account = intent.account.toLowerCase();
    // Expired reservations cannot freeze the bot forever. Never prune an in-flight submission.
    if (!executingAccounts.has(account)) {
      for (const [id, pending] of approvals) {
        if (pending.intent.account.toLowerCase() === account && nowMs() > pending.expiryMs) {
          approvals.delete(id);
          release(account);
        }
      }
    }
    if (accounts.has(account)) return deny('ACCOUNT_BUSY');
    accounts.add(account); // Reserve before awaits: concurrent prepare requests cannot race.
    try {
      const snapshot = await deps.readSnapshot(intent);
      snapshotValid(snapshot, intent, nowMs(), snapshotMaxAgeMs);
      const decision = await deps.policy(intent, Object.freeze({ ...snapshot }));
      if (decision.action === 'block') {
        release(account);
        return Object.freeze({ action: 'block', reason: decision.reason });
      }
      const proposed = decision.intent;
      checkIntent(proposed);
      const unchanged = sameAddress(proposed.account, intent.account) &&
        sameAddress(proposed.market, intent.market) &&
        proposed.side === intent.side && proposed.orderType === intent.orderType &&
        proposed.priceRaw === intent.priceRaw && proposed.clientOrderId === intent.clientOrderId;
      if (!unchanged || proposed.quantityRaw > intent.quantityRaw ||
        (decision.action === 'allow' && proposed.quantityRaw !== intent.quantityRaw)) deny('UNSAFE_POLICY_MUTATION');
      const approved = copyTrade(proposed);
      const approvalId = randomUUID();
      const expiresAtMs = nowMs() + approvalTtlMs;
      approvals.set(approvalId, { intent: approved, snapshot: Object.freeze({ ...snapshot }), expiryMs: expiresAtMs });
      return Object.freeze({ action: 'approved', approvalId, intent: approved, reason: decision.reason, expiresAtMs });
    } catch (error) {
      release(account);
      throw error;
    }
  }

  async function execute(approvalId: string): Promise<{ transactionHash: `0x${string}` }> {
    const record = consume(approvalId); // Burn capability before RPC or submission.
    try {
      const current = await deps.readSnapshot(record.intent);
      snapshotValid(current, record.intent, nowMs(), snapshotMaxAgeMs);
      if (!snapshotMatches(record.snapshot, current)) deny('STATE_DRIFT');
      return await deps.submitOrder(record.intent);
    } finally {
      executingAccounts.delete(record.intent.account.toLowerCase());
      release(record.intent.account);
    }
  }

  async function dryRun(approvalId: string): Promise<{ mode: 'dry-run'; intent: TradeIntent }> {
    const record = consume(approvalId);
    try {
      const current = await deps.readSnapshot(record.intent);
      snapshotValid(current, record.intent, nowMs(), snapshotMaxAgeMs);
      if (!snapshotMatches(record.snapshot, current)) deny('STATE_DRIFT');
      return { mode: 'dry-run', intent: record.intent };
    } finally {
      executingAccounts.delete(record.intent.account.toLowerCase());
      release(record.intent.account);
    }
  }

  return Object.freeze({ prepare, execute, dryRun });
}
