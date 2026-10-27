import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyTotalPnlReport} from '../../src/account-state/daily-total-pnl-report.ts';

const account='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const word=(n:bigint)=>n.toString(16).padStart(64,'0');
const hashes=Array.from({length:8},(_,i)=>'0x'+(i+1).toString(16).padStart(64,'0'));
const times=[86200n,86300n,86399n,86400n,86401n,86450n,86500n,87000n];
const locked={address:bank,blockNumber:'0x5',blockHash:hashes[5],logIndex:'0x0',transactionHash:'0x'+'a'.repeat(64),
  topics:['0x9d952b9056b1ad31790d622a7f5ecf49004b370b41add0e429ac1e9f4b8a3335',
    '0x'+account.slice(2).toLowerCase().padStart(64,'0'), '0x'+'b'.repeat(40).padStart(64,'0')],
  data:'0x'+word(100n),removed:false};
const deposit={...locked,logIndex:'0x1',topics:['0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4',locked.topics[1]],data:'0x'+word(50n)};
const createDeps=(records:any[]= [locked],balanceDelta=0n)=>({
  readMarginEquity:async(_:string,who:string,at:bigint)=>{
    assert.equal(who.toLowerCase(),account.toLowerCase());
    if(at===2n)return {equity:1000n,lockedCollateral:0n,asOfBlock:at};
    return {equity:900n+balanceDelta,lockedCollateral:100n,asOfBlock:at};
  },
  rpc:async(method:string,params:unknown[])=>{
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_getBlockByNumber'){
      const n=Number(BigInt(params[0] as string));
      return {number:'0x'+n.toString(16),hash:hashes[n],timestamp:'0x'+times[n].toString(16)};
    }
    if(method==='eth_getLogs')return records.filter(e=>BigInt(e.blockNumber)>=BigInt((params[0] as any).fromBlock)&&BigInt(e.blockNumber)<=BigInt((params[0] as any).toBlock));
    throw Error('unexpected rpc method '+method);
  },
});

test('total-equity day report ignores internal collateral lock while preserving deposit adjustment',async()=>{
  const got=await createDailyTotalPnlReport(createDeps([locked,deposit],50n)).read({account,asOfBlock:7n});
  assert.equal(got.utcDayStartSec,86400n);
  assert.equal(got.baselineBlock,2n);
  assert.equal(got.currentBlock,7n);
  assert.equal(got.totalEconomicEquityStartRaw,1000n);
  assert.equal(got.totalEconomicEquityEndRaw,1050n);
  assert.equal(got.netNonTradingFlowRaw,50n);
  assert.equal(got.tradingPnlRaw,0n);
  assert.equal(got.excludedInternalMarginMoveCount,1);
  assert.equal(got.riskExecutable,false);
});

test('total-equity report fails closed when an event ABI is unverified',async()=>{
  const credit={...locked,topics:['0x'+'0'.repeat(64),locked.topics[1]],data:'0x'+word(10n)};
  await assert.rejects(createDailyTotalPnlReport(createDeps([credit])).read({account,asOfBlock:7n}),/UNCLASSIFIED_BANK_EVENT/);
});

test('voucher credits and repayments cannot be disguised as verified external transfers',async()=>{
  for(const topic of [
    '0xbb4e4e24c267479b5516cddb733818a304e89c317fcc3bf1af08ff3d470ca577',
    '0x841ac654b43987d16684cd677b75b4e3eae84b9139c0ce7feb0d45fcd9e5e502',
    '0x04e2caa918a69c3e0d380a68c40c5db84fc12fec03022820849786ebf5aee368',
  ]){
    const event={...locked,topics:[topic,locked.topics[1],locked.topics[2]],data:'0x'+word(20n)+(topic.startsWith('0x04e2')?word(80n):'')};
    await assert.rejects(createDailyTotalPnlReport(createDeps([event])).read({account,asOfBlock:7n}),/UNVERIFIED_EXTERNAL_FLOW_SEMANTICS/);
  }
});

test('recognized bank deposits do not assert complete cross-boundary external-flow coverage',async()=>{
  const got=await createDailyTotalPnlReport(createDeps([deposit],50n)).read({account,asOfBlock:7n});
  assert.equal(got.netNonTradingFlowRaw,50n);
  assert.equal(got.externalFlowReceipt.complete,false);
  assert.equal(got.externalFlowReceipt.bankLogsRetrieved,true);
  assert.equal(got.externalFlowReceipt.classifiedExternalTransferCount,1);
  assert.equal(got.externalFlowReceipt.crossBoundaryCoverageProven,false);
  assert.equal(got.riskExecutable,false);
});

test('position transfers fail with explicit economic-semantics blocker instead of treating collateral movement as standalone cash',async()=>{
  const positionTransfer={...locked,
    topics:['0x9ef7ab187d9803bb95074f3925951014616c7a81290d6dc51c66caf586e4e3aa',
      locked.topics[1],'0x'+'c'.repeat(40).padStart(64,'0'),locked.topics[2]],
    data:'0x'+word(1n)+word(25n)};
  await assert.rejects(
    createDailyTotalPnlReport(createDeps([positionTransfer])).read({account,asOfBlock:7n}),
    /UNVERIFIED_POSITION_TRANSFER_SEMANTICS/,
  );
});
