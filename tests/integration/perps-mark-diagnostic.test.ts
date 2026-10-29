import test from 'node:test';
import assert from 'node:assert/strict';
import {readPerpsMarkDiagnostic} from '../../src/integration/perps-mark-diagnostic.ts';
const pool='0x'+'a'.repeat(40),oracle='0x'+'b'.repeat(40);
const client={getPerpState:async()=>({markPrice:200n,markPriceOk:true,indexPrice:201n,indexUpdatedAt:95n,oracle}),getPerpFeedStatus:async()=>({markPriceOk:true})};
test('reports a healthy protocol mark but never grants live risk authority',async()=>{
 const result=await readPerpsMarkDiagnostic({client,pool,nowSec:100n});
 assert.equal(result.markPriceRaw,'200');assert.equal(result.usableAsDiagnostic,true);assert.equal(result.riskExecutable,false);assert.equal(result.blockPinnedAcrossReaders,false);
});
test('unpriceable, zero, or stale feed never supplies a mark',async()=>{
 for(const state of [{markPriceOk:false},{markPrice:0n},{indexUpdatedAt:1n}]){
  const c={...client,getPerpState:async()=>({...await client.getPerpState(),...state})};
  const result=await readPerpsMarkDiagnostic({client:c,pool,nowSec:500n,maxIndexAgeSec:30n});
  assert.equal(result.usableAsDiagnostic,false);assert.equal(result.markPriceRaw,null);
 }
});
test('malformed state and feed failures fail closed',async()=>{
 await assert.rejects(readPerpsMarkDiagnostic({client,pool:'invalid',nowSec:100n}),/INVALID_MARK_CONTEXT/);
 const broken={...client,getPerpState:async()=>({...await client.getPerpState(),markPrice:'2' as unknown as bigint})};
 await assert.rejects(readPerpsMarkDiagnostic({client:broken,pool,nowSec:100n}),/MALFORMED_PERP_MARK/);
});
