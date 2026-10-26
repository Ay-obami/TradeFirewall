import type { AccountRiskSnapshot } from '../dreamdex/read-only.ts';

type Address = `0x${string}`;
type ChainBlock = { chainId: number; number: bigint; hash: `0x${string}`; timestampMs: number };
type RiskValues = {
  availableMarginRaw: bigint;
  currentPositionRaw: bigint;
  markPriceRaw: bigint;
  equityUsd6: string;
  dailyPnlUsd6: string;
};

export interface AccountStateSources {
  /** Observed, independently RPC-verified head. */
  readHead(): Promise<ChainBlock>;
  /** Fetch exact block again to detect chain reorganization. */
  readBlock(number: bigint): Promise<ChainBlock>;
  /** All fields MUST be read at the requested block, never `latest`. */
  readAccount(account: Address, pool: Address, atBlock: bigint): Promise<RiskValues>;
  nowMs?: () => number;
  maxAgeMs?: number;
}

const addressPattern=/^0x[0-9a-fA-F]{40}$/;
const blockHashPattern=/^0x[0-9a-fA-F]{64}$/;
const positive=/^[1-9][0-9]*$/;
const signed=/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/;

/**
 * Verifies a single block-pinned risk observation and exposes the two readers
 * expected by the SDK read-only adapter and market risk resolver. Never signs.
 */
export function createCoherentAccountReaders(sources: AccountStateSources) {
  const now=sources.nowMs ?? Date.now;
  const maxAge=sources.maxAgeMs ?? 3_000;
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0) throw new Error('INVALID_MAX_AGE');

  const verified=new Map<string,{hash:string; performance:{equityUsd6:string;dailyPnlUsd6:string}; observedAtMs:number}>();
  const key=(account:Address,pool:Address,block:bigint) => `${account.toLowerCase()}:${pool.toLowerCase()}:${block}`;

  function assertBlock(block:ChainBlock) {
    if (block?.chainId!==50383) throw new Error('WRONG_CHAIN');
    if (typeof block.number!=='bigint' || block.number<0n || !blockHashPattern.test(block.hash)) throw new Error('INVALID_BLOCK');
    if (!Number.isSafeInteger(block.timestampMs) || block.timestampMs>now() || now()-block.timestampMs>maxAge) {
      throw new Error('STALE_BLOCK');
    }
  }

  async function readAccountSnapshot(account:Address,pool:Address): Promise<AccountRiskSnapshot> {
    if (!addressPattern.test(account) || !addressPattern.test(pool)) throw new Error('INVALID_ADDRESS');
    const block=await sources.readHead();
    assertBlock(block);
    const observed=await sources.readAccount(account,pool,block.number);
    if (typeof observed?.availableMarginRaw!=='bigint' || observed.availableMarginRaw<0n ||
        typeof observed?.currentPositionRaw!=='bigint' || typeof observed?.markPriceRaw!=='bigint' || observed.markPriceRaw<=0n) {
      throw new Error('INVALID_ACCOUNT_STATE');
    }
    if (!positive.test(observed.equityUsd6) || !signed.test(observed.dailyPnlUsd6)) throw new Error('INVALID_PERFORMANCE');
    const confirmation=await sources.readBlock(block.number);
    assertBlock(confirmation);
    if (confirmation.hash.toLowerCase()!==block.hash.toLowerCase()) throw new Error('REORG_DETECTED');
    const performance=Object.freeze({equityUsd6:observed.equityUsd6,dailyPnlUsd6:observed.dailyPnlUsd6});
    verified.set(key(account,pool,block.number),{hash:block.hash.toLowerCase(),performance,observedAtMs:block.timestampMs});
    return Object.freeze({
      account,market:pool,chainId:block.chainId,blockNumber:block.number,
      observedAtMs:block.timestampMs,snapshotId:`${block.number}:${block.hash}`,
      availableMarginRaw:observed.availableMarginRaw,currentPositionRaw:observed.currentPositionRaw,markPriceRaw:observed.markPriceRaw,
    });
  }

  async function readPerformance(account:Address,pool:Address,block:bigint) {
    if (!addressPattern.test(account) || !addressPattern.test(pool) || typeof block!=='bigint') throw new Error('INVALID_REQUEST');
    const entry=verified.get(key(account,pool,block));
    if (!entry) throw new Error('UNVERIFIED_BLOCK');
    if (now()-entry.observedAtMs>maxAge) throw new Error('STALE_BLOCK');
    const confirmation=await sources.readBlock(block);
    assertBlock(confirmation);
    if (confirmation.hash.toLowerCase()!==entry.hash) throw new Error('REORG_DETECTED');
    return entry.performance;
  }
  return Object.freeze({readAccountSnapshot,readPerformance});
}
