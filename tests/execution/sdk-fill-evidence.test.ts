import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPerpsFillsFromSdk } from '../../src/execution/sdk-fill-evidence.ts';

const account='0x1111111111111111111111111111111111111111' as const;
const operator='0x3333333333333333333333333333333333333333' as const;
const pool='0x2222222222222222222222222222222222222222' as const;
const tx='0x'+'44'.repeat(32) as `0x${string}`;
const fill={blockNumber:'11',logIndex:2,market:pool,pool,maker:account,taker:operator,
  makerOrderId:'7',takerOrderId:'9',quantity:'1000',fillPrice:'2000',timestamp:'1793030836',txHash:tx};
function reader(pages:any[],sender=operator){let i=0;return {
  getChainId:async()=>50383,
  getTransactionReceipt:async()=>({transactionHash:tx,from:sender,to:pool,blockNumber:11n,status:'success'}),
  getUserFillsPage:async(_account:string,opts:{marketType:string;limit:number;cursor?:string})=>{
    assert.equal(_account,account);assert.equal(opts.marketType,'PERP');assert.equal(opts.limit,50);
    return pages[i++]??{datasetGeneration:'gen1',fills:[],nextCursor:null};
  },
};}
const request={chainId:50383,account,operator,pool,orderId:7n,transactionHash:tx};

test('confirms concrete maker fill with matching exchange seat and mined transaction',async()=>{
  const evidence=await verifyPerpsFillsFromSdk(reader([{datasetGeneration:'gen1',fills:[fill],nextCursor:null}]),request);
  assert.equal(evidence.indexerFillMatched,true);
  assert.equal(evidence.perpsFillConfirmed,false);
  assert.equal(evidence.totalBaseQuantityRaw,1000n);
  assert.deepEqual(evidence.fills.map(x=>x.logIndex),[2]);
  assert.equal(evidence.transactionSender,operator);
});

test('supports account as taker and retrieves later cursor page without mixing generations',async()=>{
  const takerFill={...fill,maker:operator,taker:account,makerOrderId:'9',takerOrderId:'7'};
  const evidence=await verifyPerpsFillsFromSdk(reader([
    {datasetGeneration:'gen1',fills:[],nextCursor:'next'},
    {datasetGeneration:'gen1',fills:[takerFill],nextCursor:null},
  ]),request);
  assert.equal(evidence.indexerFillMatched,true);
  assert.equal(evidence.fills[0].side,'taker');
});

test('rejects row with mismatched owner seat, tx, pool or unsafe values',async()=>{
  const badRows=[
    {...fill,maker:operator,taker:operator},
    {...fill,txHash:'0x'+'55'.repeat(32)},
    {...fill,pool:operator},
    {...fill,market:operator},
    {...fill,quantity:'0'},
    {...fill,blockNumber:undefined},
    {...fill,logIndex:undefined},
  ];
  for(const row of badRows){
    await assert.rejects(verifyPerpsFillsFromSdk(reader([{datasetGeneration:'gen1',fills:[row],nextCursor:null}]),request),/FILL_NOT_VERIFIED|FILL_NOT_FOUND/);
  }
});

test('fails closed on indexer inconsistency, pagination drift and duplicate fill logs',async()=>{
  const mismatched=[
    {datasetGeneration:'gen1',fills:[],nextCursor:'next'},
    {datasetGeneration:'gen2',fills:[fill],nextCursor:null},
  ];
  await assert.rejects(verifyPerpsFillsFromSdk(reader(mismatched),request),/FILL_DATASET_DRIFT/);
  await assert.rejects(verifyPerpsFillsFromSdk(reader([{datasetGeneration:'gen1',fills:[fill,fill],nextCursor:null}]),request),/DUPLICATE_FILL/);
  await assert.rejects(verifyPerpsFillsFromSdk(reader([{datasetGeneration:'gen1',fills:[],nextCursor:'next'},{datasetGeneration:'gen1',fills:[],nextCursor:'next'}]),request),/FILL_CURSOR_LOOP/);
});

test('rejects reverted receipt, unexpected operator and unverified empty fill history',async()=>{
  await assert.rejects(verifyPerpsFillsFromSdk(reader([{datasetGeneration:'gen1',fills:[fill],nextCursor:null}],account),request),/RECEIPT_SENDER_MISMATCH/);
  await assert.rejects(verifyPerpsFillsFromSdk(reader([{datasetGeneration:'gen1',fills:[],nextCursor:null}]),request),/FILL_NOT_FOUND/);
});
