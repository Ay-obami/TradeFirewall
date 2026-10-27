/** A conservative arithmetic layer, NOT a proof that all protocol flows were observed.
 * The upstream log collector must independently authenticate coverage and decoding.
 */
import {classifyBankEvent} from './bank-event-classification.ts';
type Snapshot={account:string;blockNumber:bigint;timestampSec:bigint;equityRaw:bigint};
type BalanceEvent={kind:string;category?:string;amount:bigint;blockNumber:bigint;logIndex:number;
  account?:string;child?:string;payer?:string;from?:string;to?:string};
type Coverage={complete:boolean;source:string};
const same=(a:string|undefined,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
const voucher=new Set(['AccountCredited','CreditReclaimed','FundedPrincipalReturned']);

export function reconcileDailyEquity(input:{baseline:Snapshot;current:Snapshot;events:BalanceEvent[];coverage:Coverage;
  equityBasis?:'unlocked'|'total'}) {
  const {baseline,current,events,coverage}=input;
  if(!same(baseline.account,current.account))throw Error('MISMATCHED_ACCOUNT');
  if(baseline.blockNumber>=current.blockNumber||baseline.timestampSec>current.timestampSec)throw Error('INVALID_SNAPSHOT_RANGE');
  if(!coverage?.complete)throw Error('INCOMPLETE_LOG_COVERAGE');
  if(coverage.source!=='VERIFIED_CHAIN_LOGS')throw Error('UNVERIFIED_LOG_SOURCE');
  let netNonTradingFlowRaw=0n;
  const seen=new Set<string>();
  for(const e of events) {
    let category:string;
    try {category=classifyBankEvent(e.kind).category;}
    catch {
      if(!voucher.has(e.kind))throw Error('UNCLASSIFIED_BALANCE_EVENT');
      category='voucher';
    }
    if(e.category!==undefined&&e.category!==category)throw Error('EVENT_CATEGORY_MISMATCH');
    if(typeof e.amount!=='bigint'||e.amount<0n)throw Error('INVALID_EVENT_AMOUNT');
    if(typeof e.blockNumber!=='bigint'||e.blockNumber<=baseline.blockNumber||e.blockNumber>current.blockNumber)throw Error('EVENT_OUTSIDE_RANGE');
    if(!Number.isSafeInteger(e.logIndex)||e.logIndex<0)throw Error('INVALID_LOG_INDEX');
    const id=`${e.blockNumber}:${e.logIndex}`;
    if(seen.has(id))throw Error('DUPLICATE_EVENT');
    seen.add(id);
    if(e.kind==='PositionTransferred')throw Error('UNVERIFIED_POSITION_TRANSFER_SEMANTICS');
    if(category==='trading'||category==='ignored')continue;
    if(category==='internal_collateral'&&input.equityBasis==='total')continue;
    const belongs=same(e.account,current.account);
    if(['Deposited','DepositedFor','AccountCredited','CollateralUnlocked'].includes(e.kind)) {
      if(!belongs)throw Error('IRRELEVANT_EVENT');
      netNonTradingFlowRaw+=e.amount;
    } else if(['Withdrawn','CreditReclaimed','CollateralLocked'].includes(e.kind)) {
      if(!belongs)throw Error('IRRELEVANT_EVENT');
      netNonTradingFlowRaw-=e.amount;
    } else if(e.kind==='MainFundedChild') {
      // A self-referential funding event cannot represent external capital
      // entering or leaving this account, so never count just one leg.
      if(same(e.child,current.account)&&same(e.payer,current.account))throw Error('AMBIGUOUS_SELF_TRANSFER');
      if(same(e.child,current.account))netNonTradingFlowRaw+=e.amount;
      else if(same(e.payer,current.account))netNonTradingFlowRaw-=e.amount;
      else throw Error('IRRELEVANT_EVENT');
    } else if(e.kind==='FundedPrincipalReturned') {
      if(same(e.child,current.account)&&same(e.payer,current.account))throw Error('AMBIGUOUS_SELF_TRANSFER');
      if(same(e.child,current.account))netNonTradingFlowRaw-=e.amount;
      else if(same(e.payer,current.account))netNonTradingFlowRaw+=e.amount;
      else throw Error('IRRELEVANT_EVENT');
    } else if(e.kind==='CloseOutMarginSettled') {
      if(!same(e.from,current.account)&&!same(e.to,current.account))throw Error('IRRELEVANT_EVENT');
      // SDK eventsAbi: stage-4 margin transfer between accounts, not trading PnL.
      if(same(e.from,current.account))netNonTradingFlowRaw-=e.amount;
      if(same(e.to,current.account))netNonTradingFlowRaw+=e.amount;
    }
  }
  const provisionalFlowAdjustedDeltaRaw=current.equityRaw-baseline.equityRaw-netNonTradingFlowRaw;
  return Object.freeze({account:current.account,baselineBlock:baseline.blockNumber,
    currentBlock:current.blockNumber,equityDeltaRaw:current.equityRaw-baseline.equityRaw,
    netNonTradingFlowRaw,provisionalFlowAdjustedDeltaRaw,
    // Legacy diagnostic alias; incomplete receipts do NOT prove economic/trading PnL.
    tradingPnlRaw:provisionalFlowAdjustedDeltaRaw,economicPnlProven:false as const,
    /** Caller-supplied coverage is not independently authenticated here. */
    riskExecutable:false as const,authority:'UNVERIFIED_RECONCILIATION' as const});
}
