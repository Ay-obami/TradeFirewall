import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperatorPathAudit} from '../../scripts/deploy/audit-operator-path.ts';
const owner='0x1111111111111111111111111111111111111111';
const bot='0x2222222222222222222222222222222222222222';
const pool='0x3333333333333333333333333333333333333333';
const gate='0x4444444444444444444444444444444444444444';
const hash='0x'+'a'.repeat(64);
const makeRpc=(direct:boolean,approved:boolean)=>async(method:string,params:unknown[])=>{
 if(method==='eth_chainId')return '0xc4cf';
 if(method==='eth_blockNumber')return '0x10';
 if(method==='eth_getBlockByNumber')return {hash,number:'0x10'};
 if(method==='eth_getCode')return '0x6000';
 if(method==='eth_call'){
  const data=(params[0] as {data:string}).data.toLowerCase();
  assert.equal(data.slice(0,10),'0xa8cb3794');
  assert.equal(data.slice(-64,-56),'80054449');
  return '0x'+((data.includes(bot.slice(2))?direct:approved)?'1':'0').padStart(64,'0');
 }
 throw Error('unexpected call');
};
test('only an exclusive contract Gate grant passes permission-only audit',async()=>{
 const result=await createOperatorPathAudit(makeRpc(false,true))({owner,bot,pool,gate});
 assert.equal(result.gateOnlyPermission,true);
 assert.equal(result.readyForTrading,false);
 assert.equal(result.reason,'PERMISSION_ONLY_RISK_UNVERIFIED');
 assert.equal(result.blockHash,hash);
});
test('direct bot grant remains an explicit bypass even with gate permission',async()=>{
 const result=await createOperatorPathAudit(makeRpc(true,true))({owner,bot,pool,gate});
 assert.equal(result.gateOnlyPermission,false);
 assert.equal(result.reason,'DIRECT_BOT_BYPASS_PRESENT');
});
test('missing gate and wrong chain never yield readiness',async()=>{
 const absent=await createOperatorPathAudit(makeRpc(false,true))({owner,bot,pool});
 assert.equal(absent.gateOnlyPermission,false);
 assert.equal(absent.reason,'GATE_NOT_SPECIFIED');
 await assert.rejects(createOperatorPathAudit(async()=> '0x1')({owner,bot,pool,gate}),/WRONG_CHAIN/);
});
test('mismatched block hash is rejected',async()=>{
 let calls=0;
 const rpc=async(method:string,params:unknown[])=>{
  if(method==='eth_getBlockByNumber')return {number:'0x10',hash:'0x'+(++calls===1?'a':'b').repeat(64)};
  return makeRpc(false,true)(method,params);
 };
 await assert.rejects(createOperatorPathAudit(rpc)({owner,bot,pool,gate}),/REORG_DETECTED/);
});
