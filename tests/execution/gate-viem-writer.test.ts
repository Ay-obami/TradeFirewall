import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateViemWriter} from '../../src/execution/gate-viem-writer.ts';

const bot='0x2222222222222222222222222222222222222222';
const owner='0x3333333333333333333333333333333333333333';
const gate='0x4444444444444444444444444444444444444444';
const order={pool:'0x5555555555555555555555555555555555555555',isBid:true,userData:1n,price:200n,quantity:3n,
  expireTimestampNs:1800000000000000000n,orderType:0,selfMatchingOption:0,
  builder:'0x0000000000000000000000000000000000000000',builderFeeBpsTimes1k:0n,nonce:12n,deadline:1800000000n};
const hash='0x'+'a'.repeat(64);

test('submits exactly Gate.submit via bot account on Hideki; never owner direct pool',async()=>{
  const sent:unknown[]=[];
  const walletClient={chain:{id:50383},account:{address:bot},async writeContract(tx:unknown){sent.push(tx);return hash;}};
  const writer=createGateViemWriter({walletClient,botAddress:bot,tradingOwner:owner,gateAddress:gate});
  assert.deepEqual(await writer({to:gate,order}),{transactionHash:hash});
  assert.equal(sent.length,1);
  const req=sent[0] as any;
  assert.equal(req.address,gate);
  assert.equal(req.account,bot);
  assert.equal(req.functionName,'submit');
  assert.deepEqual(req.args,[order]);
  assert.equal(req.abi[0].name,'submit');
  assert.equal(req.abi[0].inputs[0].type,'tuple');
  assert.deepEqual(req.abi[0].inputs[0].components.map((component:{name:string;type:string})=>[component.name,component.type]),[
    ['pool','address'],['isBid','bool'],['userData','uint64'],['price','uint256'],
    ['quantity','uint256'],['expireTimestampNs','uint64'],['orderType','uint8'],
    ['selfMatchingOption','uint8'],['builder','address'],['builderFeeBpsTimes1k','uint96'],
    ['nonce','uint64'],['deadline','uint256'],
  ]);
});

test('rejects wrong chain, owner signer, mismatched bot/gate before writeContract',async()=>{
  let calls=0;
  const client={chain:{id:50383},account:{address:bot},async writeContract(){calls++;return hash;}};
  await assert.rejects(createGateViemWriter({walletClient:{...client,chain:{id:1}},botAddress:bot,tradingOwner:owner,gateAddress:gate})({to:gate,order}),/WRONG_CHAIN/);
  await assert.rejects(createGateViemWriter({walletClient:{...client,account:{address:owner}},botAddress:bot,tradingOwner:owner,gateAddress:gate})({to:gate,order}),/BOT_SIGNER_MISMATCH/);
  await assert.rejects(createGateViemWriter({walletClient:client,botAddress:bot,tradingOwner:bot,gateAddress:gate})({to:gate,order}),/BOT_SIGNER_MISMATCH/);
  await assert.rejects(createGateViemWriter({walletClient:client,botAddress:bot,tradingOwner:owner,gateAddress:gate})({to:owner,order}),/WRONG_GATE/);
  assert.equal(calls,0);
});

test('malformed orders and ambiguous write failures never count as successful submission',async()=>{
  let calls=0;
  const client={chain:{id:50383},account:{address:bot},async writeContract(){calls++;return '0x1234';}};
  const writer=createGateViemWriter({walletClient:client,botAddress:bot,tradingOwner:owner,gateAddress:gate});
  await assert.rejects(writer({to:gate,order:{...order,quantity:0n}}),/INVALID_GATE_ORDER/);
  assert.equal(calls,0);
  await assert.rejects(writer({to:gate,order}),/AMBIGUOUS_BROADCAST/);
  assert.equal(calls,1);
});

test('client errors produce an ambiguous broadcast without an automatic retry',async()=>{
  let calls=0;
  const walletClient={chain:{id:50383},account:{address:bot},async writeContract(){calls++;throw Error('RPC_TIMEOUT');}};
  const writer=createGateViemWriter({walletClient,botAddress:bot,tradingOwner:owner,gateAddress:gate});
  await assert.rejects(writer({to:gate,order}),/AMBIGUOUS_BROADCAST/);
  assert.equal(calls,1);
});
