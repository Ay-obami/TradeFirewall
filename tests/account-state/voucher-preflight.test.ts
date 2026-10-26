import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoucherPreflight } from '../../src/account-state/voucher-preflight.ts';

const owner='0x1111111111111111111111111111111111111111' as const;
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394' as const;

test('reads official SDK voucher eligibility for the selected account and bank', async () => {
  const calls:unknown[][]=[];
  const preflight=createVoucherPreflight({
    readChainId:async()=>50383,
    client:{getPerpVoucherEligibility:async (...args:unknown[])=>{calls.push(args);return {eligible:true};}},
  });
  const result=await preflight.read({account:owner,marginBank:bank});
  assert.deepEqual(calls,[[bank,owner]]);
  assert.deepEqual(result,{account:owner,marginBank:bank,chainId:50383,eligible:true,authority:'ADVISORY_ONLY'});
  assert.equal('equityUsd6' in result,false);
});

test('refuses wrong chain, invalid identity, and malformed eligibility without fabricating financial risk data', async()=>{
  const yes={client:{getPerpVoucherEligibility:async()=>({eligible:true})}};
  await assert.rejects(createVoucherPreflight({...yes,readChainId:async()=>1}).read({account:owner,marginBank:bank}),/WRONG_CHAIN/);
  await assert.rejects(createVoucherPreflight({...yes,readChainId:async()=>50383}).read({account:'0xabc' as any,marginBank:bank}),/INVALID_ADDRESS/);
  await assert.rejects(createVoucherPreflight({readChainId:async()=>50383,client:{getPerpVoucherEligibility:async()=>({eligible:'true'})}}).read({account:owner,marginBank:bank}),/INVALID_ELIGIBILITY/);
});

test('does not accept account-state read interfaces as voucher permission evidence', async()=>{
  const preflight=createVoucherPreflight({readChainId:async()=>50383,client:{} as any});
  await assert.rejects(preflight.read({account:owner,marginBank:bank}),/MISSING_SDK_METHOD/);
});
