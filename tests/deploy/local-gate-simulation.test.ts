import assert from 'node:assert/strict';
import test from 'node:test';
import {simulateLocalGateLifecycle} from '../../src/deploy/local-gate-simulation.ts';

const admin='0x1111111111111111111111111111111111111111';
const bot='0x2222222222222222222222222222222222222222';
const owner='0x3333333333333333333333333333333333333333';
const pool='0x4444444444444444444444444444444444444444';
const gate='0x5555555555555555555555555555555555555555';
const zero='0x0000000000000000000000000000000000000000';
const order=(nonce:bigint,deadline=1200n)=>({pool,isBid:true,userData:0n,price:1500n,quantity:150n,
  expireTimestampNs:deadline*1_000_000_000n,orderType:0,selfMatchingOption:0,builder:zero,
  builderFeeBpsTimes1k:0n,nonce,deadline});
const setup=[
  {kind:'deploy',from:admin,atSec:1000n},
  {kind:'configure',from:admin,atSec:1001n,pool,maxQuantityRaw:100n,minPriceRaw:1000n,maxPriceRaw:2000n,grossQuantityRaw:150n},
  {kind:'grant',from:owner,atSec:1002n,pool,operator:gate,selector:'0x80054449',reviewExpiresAtSec:1100n},
] as const;
const input={chainId:50383,administrator:admin,bot,tradingOwner:owner,gateAddress:gate,pool};

test('simulates deploy/configure/exclusive grant, then only included bot order consumes allowance',()=>{
  const result=simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
    {kind:'include',from:bot,atSec:1004n,transactionNonce:8n},
  ]});
  assert.equal(result.kind,'LOCAL_SIMULATION_ONLY');
  assert.equal(result.readyToBroadcast,false);
  assert.equal(result.forwarded.length,1);
  assert.deepEqual(result.forwarded[0],{orderNonce:1n,transactionNonce:8n,submittedQuantity:100n});
  assert.equal(result.remainingGrossQuantityRaw,50n);
  assert.equal(result.botDirectAuthorized,false);
});

test('replacement at same transaction nonce needs fee bump and only latest order can be included',()=>{
  const result=simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
    {kind:'replace',from:bot,atSec:1004n,transactionNonce:8n,maxFeePerGas:11n,order:order(2n)},
    {kind:'include',from:bot,atSec:1005n,transactionNonce:8n},
  ]});
  assert.equal(result.forwarded[0].orderNonce,2n);
  assert.equal(result.forwarded.length,1);
  assert.throws(()=>simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
    {kind:'replace',from:bot,atSec:1004n,transactionNonce:8n,maxFeePerGas:10n,order:order(2n)},
  ]}),/REPLACEMENT_FEE_NOT_HIGHER/);
});

test('stale off-chain approval review blocks inclusion without claiming on-chain revocation',()=>{
  assert.throws(()=>simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
    {kind:'include',from:bot,atSec:1101n,transactionNonce:8n},
  ]}),/APPROVAL_REVIEW_EXPIRED/);
  assert.throws(()=>simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n,1005n)},
    {kind:'include',from:bot,atSec:1005n,transactionNonce:8n},
  ]}),/ORDER_EXPIRED/);
});

test('rejects direct bot grants, wrong sender, replayed Gate nonce and duplicate mined tx nonce',()=>{
  assert.throws(()=>simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'grant',from:owner,atSec:1003n,pool,operator:bot,selector:'0x80054449',reviewExpiresAtSec:1100n},
  ]}),/DIRECT_BOT_OPERATOR_BYPASS/);
  assert.throws(()=>simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:owner,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
  ]}),/NOT_BOT/);
  assert.throws(()=>simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
    {kind:'include',from:bot,atSec:1004n,transactionNonce:8n},
    {kind:'queue',from:bot,atSec:1005n,transactionNonce:9n,maxFeePerGas:10n,order:order(1n)},
    {kind:'include',from:bot,atSec:1006n,transactionNonce:9n},
  ]}),/GATE_NONCE_REPLAY/);
  assert.throws(()=>simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
    {kind:'include',from:bot,atSec:1004n,transactionNonce:8n},
    {kind:'include',from:bot,atSec:1005n,transactionNonce:8n},
  ]}),/TRANSACTION_NONCE_ALREADY_INCLUDED/);
});

test('reconfiguring a market never replenishes gross capacity already consumed',()=>{
  const result=simulateLocalGateLifecycle({...input,actions:[...setup,
    {kind:'queue',from:bot,atSec:1003n,transactionNonce:8n,maxFeePerGas:10n,order:order(1n)},
    {kind:'include',from:bot,atSec:1004n,transactionNonce:8n},
    {kind:'configure',from:admin,atSec:1005n,pool,maxQuantityRaw:100n,minPriceRaw:1000n,maxPriceRaw:2000n,grossQuantityRaw:150n},
  ]});
  assert.equal(result.remainingGrossQuantityRaw,50n);
});
