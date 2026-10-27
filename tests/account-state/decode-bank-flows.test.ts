import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeKnownBankFlows} from '../../src/account-state/decode-bank-flows.ts';

const a='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const b='0x1111111111111111111111111111111111111111';
const word=(v:bigint)=>v.toString(16).padStart(64,'0');
const topicAddress=(address:string)=>'0x'+address.slice(2).toLowerCase().padStart(64,'0');
const base={blockNumber:12n,logIndex:0};
const topics={
  Deposited:'0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4',
  MainFundedChild:'0x6f54bb5da6f66577f26d5a767cfee4afb2bef9f61c9a9198771744761996d241',
  CloseOutMarginSettled:'0x6eab1c44b6035b703dfba0abf1e04d929563c97ec9808120fdf15a87bc118dca',
  CollateralLocked:'0x9d952b9056b1ad31790d622a7f5ecf49004b370b41add0e429ac1e9f4b8a3335',
  AccountCredited:'0xbb4e4e24c267479b5516cddb733818a304e89c317fcc3bf1af08ff3d470ca577',
};

test('decodes verified indexed bank flow layout and does not confuse remaining data words with amounts',()=>{
  const got=decodeKnownBankFlows([
    {...base,topics:[topics.Deposited,topicAddress(a)],data:'0x'+word(10n)},
    {...base,logIndex:1,topics:[topics.MainFundedChild,topicAddress(a),topicAddress(b)],data:'0x'+word(20n)+word(500n)},
    {...base,logIndex:2,topics:[topics.CloseOutMarginSettled,topicAddress(a),topicAddress(b)],data:'0x'+word(30n)},
    {...base,logIndex:3,topics:[topics.CollateralLocked,topicAddress(a),topicAddress(b)],data:'0x'+word(40n)},
  ],a);
  assert.deepEqual(got.map(x=>[x.kind,x.amount]),[['Deposited',10n],['MainFundedChild',20n],['CloseOutMarginSettled',30n],['CollateralLocked',40n]]);
  assert.equal(got[1].child.toLowerCase(),a.toLowerCase());
  assert.equal(got[1].payer.toLowerCase(),b.toLowerCase());
});

test('rejects unsupported credit ABI indexing and any unrecognized bank topic',()=>{
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[topics.AccountCredited,topicAddress(a)],data:'0x'+word(1n)}],a),/UNVERIFIED_EVENT_ABI/);
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:['0x'+'0'.repeat(64)],data:'0x'}],a),/UNCLASSIFIED_BANK_EVENT/);
});

test('refuses malformed words, forged account topic, and non-account-impacting bank events',()=>{
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[topics.Deposited,topicAddress(a)],data:'0x1234'}],a),/MALFORMED_EVENT/);
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[topics.Deposited,'0x'+'f'.repeat(64)],data:'0x'+word(1n)}],a),/MALFORMED_EVENT/);
  assert.deepEqual(decodeKnownBankFlows([{...base,topics:[topics.Deposited,topicAddress(b)],data:'0x'+word(1n)}],a),[]);
});
