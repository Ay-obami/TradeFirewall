import { verifyMinedTransactionEvidence, type TransactionReceiptReadPort } from './receipt-evidence.ts';

type Address = `0x${string}`;

/** Shape verified in @somnia-chain/markets-sdk@0.32.1 src/fills.ts. */
export interface UserFillRow {
  blockNumber?: string;
  logIndex?: number;
  market: string;
  pool: string;
  maker: string | null;
  taker: string | null;
  makerOrderId: string;
  takerOrderId: string;
  quantity: string;
  fillPrice: string;
  timestamp: string;
  txHash: string;
}
export interface UserFillsPage {
  datasetGeneration: string;
  fills: UserFillRow[];
  nextCursor: string | null;
}
export interface UserFillsReadPort extends TransactionReceiptReadPort {
  /** The SDK must be configured without a private key for this read-only use. */
  getUserFillsPage(account: Address, opts: {
    marketType: 'PERP'; limit: 50; cursor?: string;
  }): Promise<unknown>;
}
export interface IndexedFillRequest {
  chainId: number;
  /** Beneficial owner of the position, potentially different from linked bot operator. */
  account: Address;
  /** Proven transaction sender/operator, checked against RPC receipt. */
  operator: Address;
  pool: Address;
  orderId: bigint;
  transactionHash: Address;
}
export interface IndexedFillEvidence {
  kind: 'indexed_perps_fill_correlated_to_receipt';
  chainId: 50383;
  transactionHash: Address;
  transactionSender: Address;
  account: Address;
  pool: Address;
  orderId: bigint;
  receiptBlock: bigint;
  datasetGeneration: string;
  totalBaseQuantityRaw: bigint;
  fills: Array<Readonly<{blockNumber:bigint;logIndex:number;side:'maker'|'taker';quantityRaw:bigint;fillPriceRaw:bigint}>>;
  indexerFillMatched: true;
  /** Still requires independently decoded PerpPool receipt logs. */
  perpsFillConfirmed: false;
}
const addressPattern=/^0x[0-9a-f]{40}$/i;
const hashPattern=/^0x[0-9a-f]{64}$/i;
const uintPattern=/^(0|[1-9][0-9]*)$/;
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
function uint(value:unknown):bigint {
  if(typeof value!=='string'||!uintPattern.test(value)) throw new Error('FILL_NOT_VERIFIED: malformed unsigned value');
  return BigInt(value);
}
function validateRequest(q:IndexedFillRequest):void {
  if(q.chainId!==50383 || typeof q.account!=='string'||!addressPattern.test(q.account)
    ||typeof q.operator!=='string'||!addressPattern.test(q.operator)
    ||typeof q.pool!=='string'||!addressPattern.test(q.pool)
    ||typeof q.transactionHash!=='string'||!hashPattern.test(q.transactionHash)
    ||typeof q.orderId!=='bigint'||q.orderId<=0n) {
    throw new Error('FILL_INPUT_INVALID');
  }
}

/**
 * Correlate SDK-indexed PERP fills with a separately fetched mined receipt.
 * SDK indexer data is NOT independent on-chain log verification, so the return
 * never sets perpsFillConfirmed=true. Never convert this to bounty trade proof
 * without a verified PerpPool ABI and receipt-log matching step.
 */
export async function verifyPerpsFillsFromSdk(reader:UserFillsReadPort,q:IndexedFillRequest):Promise<IndexedFillEvidence> {
  validateRequest(q);
  const receipt=await verifyMinedTransactionEvidence(reader,{
    chainId:q.chainId,account:q.operator,transactionHash:q.transactionHash,
  });
  const cursorSet=new Set<string>();
  const eventSet=new Set<string>();
  const matches:IndexedFillEvidence['fills']=[];
  let cursor:string|undefined;
  let generation:string|undefined;
  let done=false;
  for(let pageIndex=0;pageIndex<10;pageIndex++) {
    const response=await reader.getUserFillsPage(q.account,{marketType:'PERP',limit:50,...(cursor?{cursor}:{})});
    if(!response||typeof response!=='object') throw new Error('FILL_PAGE_INVALID');
    const page=response as Record<string,unknown>;
    if(typeof page.datasetGeneration!=='string'||!page.datasetGeneration
      ||!Array.isArray(page.fills)
      ||(page.nextCursor!==null && typeof page.nextCursor!=='string')) throw new Error('FILL_PAGE_INVALID');
    if(generation===undefined) generation=page.datasetGeneration;
    if(page.datasetGeneration!==generation) throw new Error('FILL_DATASET_DRIFT');
    for(const raw of page.fills) {
      if(!raw||typeof raw!=='object') throw new Error('FILL_NOT_VERIFIED: malformed indexed row');
      const row=raw as Record<string,unknown>;
      // The index may return other fills for the owner; they are irrelevant.
      if(typeof row.txHash!=='string'||!hashPattern.test(row.txHash)) throw new Error('FILL_NOT_VERIFIED: invalid tx');
      if(!same(row.txHash,q.transactionHash)) continue;
      const makerOrder=uint(row.makerOrderId);
      const takerOrder=uint(row.takerOrderId);
      const makerSeat=row.maker===q.account || (typeof row.maker==='string'&&same(row.maker,q.account));
      const takerSeat=row.taker===q.account || (typeof row.taker==='string'&&same(row.taker,q.account));
      const isMaker=makerSeat&&makerOrder===q.orderId;
      const isTaker=takerSeat&&takerOrder===q.orderId;
      if(!isMaker&&!isTaker) continue;
      if(isMaker&&isTaker || typeof row.pool!=='string'||!addressPattern.test(row.pool)||!same(row.pool,q.pool)
        ||typeof row.market!=='string'||!addressPattern.test(row.market)||!same(row.market,q.pool)
        ||typeof row.logIndex!=='number'||!Number.isSafeInteger(row.logIndex)||row.logIndex<0) {
        throw new Error('FILL_NOT_VERIFIED: inconsistent matched fill');
      }
      const blockNumber=uint(row.blockNumber);
      const quantityRaw=uint(row.quantity);
      const fillPriceRaw=uint(row.fillPrice);
      const timestamp=uint(row.timestamp);
      if(blockNumber!==receipt.blockNumber||quantityRaw<=0n||fillPriceRaw<=0n||timestamp<=0n) {
        throw new Error('FILL_NOT_VERIFIED: malformed or wrong-block fill');
      }
      const key=`${blockNumber}:${row.logIndex}`;
      if(eventSet.has(key)) throw new Error('DUPLICATE_FILL');
      eventSet.add(key);
      matches.push({blockNumber,logIndex:row.logIndex,side:isMaker?'maker':'taker',quantityRaw,fillPriceRaw});
    }
    if(page.nextCursor===null) {done=true;break;}
    if(!page.nextCursor || cursorSet.has(page.nextCursor)) throw new Error('FILL_CURSOR_LOOP');
    cursorSet.add(page.nextCursor);
    cursor=page.nextCursor;
  }
  if(!done) throw new Error('FILL_PAGE_LIMIT');
  if(matches.length===0) throw new Error('FILL_NOT_FOUND');
  matches.sort((a,b)=>a.logIndex-b.logIndex);
  return {
    kind:'indexed_perps_fill_correlated_to_receipt',chainId:50383,
    transactionHash:q.transactionHash,transactionSender:q.operator,
    account:q.account,pool:q.pool,orderId:q.orderId,receiptBlock:receipt.blockNumber,
    datasetGeneration:generation!,totalBaseQuantityRaw:matches.reduce((sum,f)=>sum+f.quantityRaw,0n),
    fills:matches,indexerFillMatched:true,perpsFillConfirmed:false,
  };
}
