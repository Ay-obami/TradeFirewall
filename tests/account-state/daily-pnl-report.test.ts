import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyPnlReport} from '../../src/account-state/daily-pnl-report.ts';

const account='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const word=(n:bigint)=>n.toString(16).padStart(64,'0');
const hashes=Array.from({length:8},(_,i)=>'0x'+(i+1).toString(16).padStart(64,'0'));
const timestamps=[86200n,86300n,86399n,86400n,86401n,86450n,86500n,87000n];
const locked={address:bank,blockNumber:'0x5',blockHash:hashes[5],logIndex:'0x0',transactionHash:'0x'+'a'.repeat(64),
  topics:['0x9d952b9056b1ad31790d622a7f5ecf49004b370b41add0e429ac1e9f4b8a3335',
    '0x'+account.slice(2).toLowerCase().padStart(64,'0'), '0x'+'b'.repeat(40).padStart(64,'0')],
  data:'0x'+word(100n),removed:false};
const makeRpc=(event=locked)=>async(method:string,params:unknown[])=>{
  if(method==='eth_chainId')return '0xc4cf';
  if(method==='eth_blockNumber')return '0x7';
  if(method==='eth_getBlockByNumber'){
    const n=Number(BigInt(params[0] as string));
    return {number:'0x'+n.toString(16),hash:hashes[n],timestamp:'0x'+timestamps[n].toString(16)};
  }
  if(method==='eth_call')return '0x'+word(params[1]==='0x2'?1000n:970n);
  if(method==='eth_getLogs')return BigInt((params[0] as any).fromBlock)<=5n&&BigInt((params[0] as any).toBlock)>=5n?[event]:[];
  throw Error(`unsupported ${method}`);
};

test('end-to-end report pins day boundary and removes collateral lock from marked equity change',async()=>{
  const report=await createDailyPnlReport({rpc:makeRpc()}).read({account,asOfBlock:7n});
  assert.equal(report.baselineBlock,2n);
  assert.equal(report.currentBlock,7n);
  assert.equal(report.equityDeltaRaw,-30n);
  assert.equal(report.netNonTradingFlowRaw,-100n);
  assert.equal(report.tradingPnlRaw,70n);
  assert.equal(report.utcDayStartSec,86400n);
  assert.equal(report.riskExecutable,false);
});

test('end-to-end report refuses unclassified bank events rather than claiming authoritative PnL',async()=>{
  const voucher={...locked,topics:['0x'+'0'.repeat(64),locked.topics[1]],data:'0x'+word(20n)};
  await assert.rejects(createDailyPnlReport({rpc:makeRpc(voucher)}).read({account,asOfBlock:7n}),/UNCLASSIFIED_BANK_EVENT/);
});
