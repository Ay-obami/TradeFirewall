import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollateralProvenanceReader } from '../../src/account-state/collateral-provenance.ts';

const token='0xed7993A74dAe1e6656B704A424DcD8711aAf4F72';
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const hash='0x'+'ab'.repeat(32);
const block={number:'0x64',hash,timestamp:'0x65'};
const config={collateralToken:token,perpPoolFactory:'0xE631fAEE547baeE07353E290f0562ea67d856560',liquidationEngine:'0xA66d3C24Ad4a389d863846905D8173e1017e9F4D',insuranceFund:'0x50826894D47C6D4f3BeA38BFDC7Dc5c5be171b80',fullyWired:true,asOfBlock:100n};

function fixture(overrides:{chain?:string;decimals?:string;code?:string;block?:typeof block;config?:Record<string,unknown>;reorg?:boolean}={}){
  const calls:{method:string;params:unknown[]}[]=[];
  let blocks=0;
  const rpc=async(method:string,params:unknown[])=>{
    calls.push({method,params});
    if(method==='eth_chainId')return overrides.chain??'0xc4cf';
    if(method==='eth_getBlockByNumber'){
      blocks++;
      return overrides.reorg&&blocks===2?{...block,hash:'0x'+'cd'.repeat(32)}:overrides.block??block;
    }
    if(method==='eth_getCode')return overrides.code??'0x6001';
    if(method==='eth_call')return overrides.decimals??'0x'+'0'.repeat(62)+'12';
    throw Error('UNEXPECTED_RPC');
  };
  const reader=createCollateralProvenanceReader({rpc,readPerpSystemConfig:async(_bank,at)=>({...config,...overrides.config})});
  return {reader,calls};
}

test('pins deployed perps token and decimals and scales exact nominal USDso6 without claiming a USD peg',async()=>{
  const {reader,calls}=fixture();
  const result=await reader.read({blockNumber:100n,amountRaw:1_234_567_890_123_456_789n});
  assert.equal(result.collateralAddress,token);
  assert.equal(result.collateralDecimals,18);
  assert.equal(result.nominalUsdso6,'1234567');
  assert.equal(result.usdValue6,null);
  assert.equal(result.usdPriceAuthority,'UNVERIFIED');
  assert.equal(result.riskExecutable,false);
  assert.equal(result.blockHash,hash);
  assert.deepEqual(calls.filter(c=>c.method==='eth_call').map(c=>c.params),[[{to:token,data:'0x313ce567'},'0x64']]);
});

test('rejects wrong chain, collateral identity or stale SDK config',async()=>{
  await assert.rejects(fixture({chain:'0x1'}).reader.read({blockNumber:100n,amountRaw:1n}),/WRONG_CHAIN/);
  await assert.rejects(fixture({config:{collateralToken:'0x'+'11'.repeat(20)}}).reader.read({blockNumber:100n,amountRaw:1n}),/COLLATERAL_MISMATCH/);
  await assert.rejects(fixture({config:{asOfBlock:99n}}).reader.read({blockNumber:100n,amountRaw:1n}),/SDK_BLOCK_MISMATCH/);
  await assert.rejects(fixture({config:{fullyWired:false}}).reader.read({blockNumber:100n,amountRaw:1n}),/UNWIRED_PERPS_CONFIG/);
});

test('rejects bad code, malformed or non-18 decimals, and block reorganization',async()=>{
  const input={blockNumber:100n,amountRaw:1n};
  await assert.rejects(fixture({code:'0x'}).reader.read(input),/MISSING_COLLATERAL_CODE/);
  await assert.rejects(fixture({decimals:'0x12'}).reader.read(input),/INVALID_DECIMALS_RESPONSE/);
  await assert.rejects(fixture({decimals:'0x'+'0'.repeat(63)+'6'}).reader.read(input),/COLLATERAL_DECIMALS_MISMATCH/);
  await assert.rejects(fixture({reorg:true}).reader.read(input),/REORG_DETECTED/);
});

test('rejects negative and non-bigint balances and invalid requested block',async()=>{
  const reader=fixture().reader;
  await assert.rejects(reader.read({blockNumber:100n,amountRaw:-1n}),/INVALID_COLLATERAL_AMOUNT/);
  await assert.rejects(reader.read({blockNumber:100n,amountRaw:1 as unknown as bigint}),/INVALID_COLLATERAL_AMOUNT/);
  await assert.rejects(reader.read({blockNumber:-1n,amountRaw:1n}),/INVALID_BLOCK/);
});
