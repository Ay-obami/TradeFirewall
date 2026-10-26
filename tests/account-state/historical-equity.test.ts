import assert from 'node:assert/strict';
import test from 'node:test';
import {createHistoricalEquityReader} from '../../src/account-state/historical-equity.ts';

const account='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const hash='0x'+'a'.repeat(64);
const block={number:'0x64',hash,timestamp:'0x5f5e100'};
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';

test('pins historical MarginBank equity to a verified block and detects reorg',async()=>{
  const requests:Array<{method:string;params:unknown[]}>=[];
  const rpc=async(method:string,params:unknown[])=>{
    requests.push({method,params});
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_getBlockByNumber')return block;
    if(method==='eth_call')return '0x'+(123456789n).toString(16).padStart(64,'0');
    throw Error('unexpected');
  };
  const got=await createHistoricalEquityReader({rpc}).read({account,blockNumber:100n});
  assert.equal(got.equityRaw,123456789n);
  assert.equal(got.blockHash,hash);
  assert.equal(got.blockNumber,100n);
  assert.equal(got.authority,'VERIFIED_HISTORICAL_CHAIN_READ');
  const call=requests.find(r=>r.method==='eth_call')!;
  assert.equal((call.params[0] as any).to.toLowerCase(),bank.toLowerCase());
  assert.equal((call.params[0] as any).data.slice(0,10),'0x792e6c4d');
  assert.equal(call.params[1],'0x64');
});

test('decodes signed negative equity and refuses changed block identity',async()=>{
  let calls=0;
  const allF='0x'+'f'.repeat(64);
  const reader=createHistoricalEquityReader({rpc:async(method)=>{
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_call')return allF;
    calls++;
    return calls===1?block:{...block,hash:'0x'+'b'.repeat(64)};
  }});
  await assert.rejects(reader.read({account,blockNumber:100n}),/REORG_DETECTED/);
  const stable=createHistoricalEquityReader({rpc:async(method)=>method==='eth_chainId'?'0xc4cf':method==='eth_call'?allF:block});
  assert.equal((await stable.read({account,blockNumber:100n})).equityRaw,-1n);
});

test('wrong chain, malformed account, wrong block, and malformed rpc fail closed',async()=>{
  const good=async(method:string)=>method==='eth_chainId'?'0xc4cf':method==='eth_call'?'0x'+'0'.repeat(64):block;
  await assert.rejects(createHistoricalEquityReader({rpc:good}).read({account:'0x123',blockNumber:100n}),/INVALID_ACCOUNT/);
  await assert.rejects(createHistoricalEquityReader({rpc:good}).read({account,blockNumber:-1n}),/INVALID_BLOCK/);
  await assert.rejects(createHistoricalEquityReader({rpc:async()=> '0x1'}).read({account,blockNumber:100n}),/WRONG_CHAIN/);
  await assert.rejects(createHistoricalEquityReader({rpc:async(method)=>method==='eth_chainId'?'0xc4cf':method==='eth_call'?'0x2':block}).read({account,blockNumber:100n}),/INVALID_EQUITY_RESPONSE/);
});
