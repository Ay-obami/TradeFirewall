import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeGateSubmitCalldata,buildUnsignedGateTransaction} from '../../src/execution/gate-tx-encoder.ts';

const owner='0x1111111111111111111111111111111111111111';
const gate='0x2222222222222222222222222222222222222222';
const pool='0x3333333333333333333333333333333333333333';
const zeros='0x0000000000000000000000000000000000000000';
const word=(number:bigint)=>number.toString(16).padStart(64,'0');
const addressWord=(address:string)=>address.slice(2).toLowerCase().padStart(64,'0');
const order={pool,isBid:true,userData:7n,price:123456n,quantity:987n,
  expireTimestampNs:10000000000n,orderType:1,selfMatchingOption:0,
  builder:zeros,builderFeeBpsTimes1k:0n,nonce:42n,deadline:1000n};

test('encodes the compiled Solidity static tuple for TradeFirewallGate.submit(Order)',()=>{
  const expected='0xa99b37c0'+[
    addressWord(pool),word(1n),word(7n),word(123456n),word(987n),
    word(10000000000n),word(1n),word(0n),addressWord(zeros),word(0n),word(42n),word(1000n),
  ].join('');
  const got=encodeGateSubmitCalldata(order);
  assert.equal(got,expected);
  assert.equal(got.length,2+8+12*64);
  assert.deepEqual(buildUnsignedGateTransaction(gate,order),{to:gate,data:expected,value:0n});
});

test('rejects invalid addresses and out-of-bounds contract parameters before encoding',()=>{
  assert.throws(()=>encodeGateSubmitCalldata({...order,pool:'0x123'}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,userData:1n<<64n}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,nonce:1n<<64n}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,expireTimestampNs:1n<<64n}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,builderFeeBpsTimes1k:1n<<96n}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,builderFeeBpsTimes1k:1n}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,builder:owner}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,deadline:1n<<256n}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,orderType:256}),/INVALID_GATE_ORDER/);
  assert.throws(()=>encodeGateSubmitCalldata({...order,isBid:1}),/INVALID_GATE_ORDER/);
  assert.throws(()=>buildUnsignedGateTransaction('0x123',order),/INVALID_GATE_ADDRESS/);
});

test('preserves uint256 upper bound and encodes false bool and the largest narrow integers',()=>{
  const max={...order,isBid:false,userData:(1n<<64n)-1n,nonce:(1n<<64n)-1n,
    deadline:(1n<<256n)-1n};
  const data=encodeGateSubmitCalldata(max);
  assert.equal(data.slice(10+64,10+128),word(0n));
  assert.equal(data.slice(-64),'f'.repeat(64));
});
