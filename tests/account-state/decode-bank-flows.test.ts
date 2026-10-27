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
  CreditReclaimed:'0x841ac654b43987d16684cd677b75b4e3eae84b9139c0ce7feb0d45fcd9e5e502',
  FundedPrincipalReturned:'0x04e2caa918a69c3e0d380a68c40c5db84fc12fec03022820849786ebf5aee368',
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

test('decodes on-chain verified credit issuer and linked-wallet principal return fields',()=>{
  const got=decodeKnownBankFlows([
    {...base,topics:[topics.AccountCredited,topicAddress(a),topicAddress(b)],data:'0x'+word(111n)},
    {...base,logIndex:1,topics:[topics.FundedPrincipalReturned,topicAddress(a),topicAddress(b)],data:'0x'+word(12n)+word(98n)},
  ],a);
  assert.deepEqual(got.map(x=>[x.kind,x.amount]),[['AccountCredited',111n],['FundedPrincipalReturned',12n]]);
  assert.equal(got[0].account.toLowerCase(),a.toLowerCase());
  assert.equal(got[0].source.toLowerCase(),b.toLowerCase());
  assert.equal(got[1].child.toLowerCase(),a.toLowerCase());
  assert.equal(got[1].payer.toLowerCase(),b.toLowerCase());
});

test('credit issuer is not treated as recipient and payer sees principal return',()=>{
  const got=decodeKnownBankFlows([
    {...base,topics:[topics.AccountCredited,topicAddress(a),topicAddress(b)],data:'0x'+word(40n)},
    {...base,logIndex:1,topics:[topics.FundedPrincipalReturned,topicAddress(a),topicAddress(b)],data:'0x'+word(30n)+word(90n)},
  ],b);
  assert.deepEqual(got.map(x=>x.kind),['FundedPrincipalReturned']);
  assert.equal(got[0].amount,30n);
});

test('decodes deployed CreditReclaimed LOG3 layout as an account debit without attributing it to source',()=>{
  const asAccount=decodeKnownBankFlows([{
    ...base,topics:[topics.CreditReclaimed,topicAddress(a),topicAddress(b)],data:'0x'+word(17n),
  }],a);
  assert.deepEqual(asAccount.map(x=>[x.kind,x.amount]),[['CreditReclaimed',17n]]);
  assert.equal(asAccount[0].account.toLowerCase(),a.toLowerCase());
  assert.equal(asAccount[0].source.toLowerCase(),b.toLowerCase());
  const asSource=decodeKnownBankFlows([{
    ...base,topics:[topics.CreditReclaimed,topicAddress(a),topicAddress(b)],data:'0x'+word(17n),
  }],b);
  assert.deepEqual(asSource,[]);
});

test('rejects malformed credit reclaim event and any unrecognized bank topic',()=>{
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[topics.CreditReclaimed,topicAddress(a)],data:'0x'+word(1n)}],a),/MALFORMED_EVENT/);
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[topics.AccountCredited,topicAddress(a)],data:'0x'+word(1n)}],a),/MALFORMED_EVENT/);
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:['0x'+'0'.repeat(64)],data:'0x'}],a),/UNCLASSIFIED_BANK_EVENT/);
});

test('refuses malformed words, forged account topic, and non-account-impacting bank events',()=>{
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[topics.Deposited,topicAddress(a)],data:'0x1234'}],a),/MALFORMED_EVENT/);
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[topics.Deposited,'0x'+'f'.repeat(64)],data:'0x'+word(1n)}],a),/MALFORMED_EVENT/);
  assert.deepEqual(decodeKnownBankFlows([{...base,topics:[topics.Deposited,topicAddress(b)],data:'0x'+word(1n)}],a),[]);
});

// Literal topic0 values independently derived with Keccak-256 from the published
// @somnia-chain/markets-sdk@0.32.1 package/src/eventsAbi.ts signatures.
const sdkCases:ReadonlyArray<{
  name:string;topic:string;roles:string[];dataTypes:string[];amountIndex:number|null;category:string;
}>=[
  {name:'PositionUpdated',topic:'0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de',roles:['account','perpPool'],dataTypes:['int128','uint128','int256','int256'],amountIndex:null,category:'trading'},
  {name:'FundingSettled',topic:'0xa15061682858c3fa114522ab30e2d34c3454420d616b62130925b9ee2631ca85',roles:['account','perpPool'],dataTypes:['int256'],amountIndex:null,category:'trading'},
  {name:'Deposited',topic:topics.Deposited,roles:['account'],dataTypes:['uint256'],amountIndex:0,category:'external_transfer'},
  {name:'DepositedFor',topic:'0x11fa725a956e1222d809b94ec211abe46e4218803a3c67d50f6fd9e46ba20a0e',roles:['account','perpPool'],dataTypes:['uint256'],amountIndex:0,category:'external_transfer'},
  {name:'Withdrawn',topic:'0x7084f5476618d8e60b11ef0d7d3f06914655adb8793e28ff7f018d4c76d505d5',roles:['account'],dataTypes:['uint256'],amountIndex:0,category:'external_transfer'},
  {name:'CollateralLocked',topic:topics.CollateralLocked,roles:['account','perpPool'],dataTypes:['uint256'],amountIndex:0,category:'internal_collateral'},
  {name:'CollateralUnlocked',topic:'0x5c87c81b4945a78d177e7c3dfbc9a6eaa971757d39f3b93c514446b47b5a2e1a',roles:['account','perpPool'],dataTypes:['uint256'],amountIndex:0,category:'internal_collateral'},
  {name:'FeeCharged',topic:'0x2a2899ae8177fb54d81544d727d24141bf8fd23e78e721fe56cda337d397044b',roles:['account','perpPool'],dataTypes:['uint256','uint256'],amountIndex:0,category:'trading'},
  {name:'RebatePaid',topic:'0xb5ec5e03662403108373ab6431d3e834cb1011fca164541aef315fc7dea7b3b6',roles:['account','perpPool'],dataTypes:['uint256'],amountIndex:0,category:'trading'},
  {name:'AutoDeleveraged',topic:'0x08fcdd8dbc6e7103f6145428f23ce550dd730383de88b64e748f6700486fb6cf',roles:['counterparty','perpPool','bankrupt'],dataTypes:['int128','uint256'],amountIndex:null,category:'trading'},
  {name:'CloseOutMarginSettled',topic:topics.CloseOutMarginSettled,roles:['from','to'],dataTypes:['uint256'],amountIndex:0,category:'external_transfer'},
  {name:'BadDebtAbsorbed',topic:'0x6392407d3767368407133def2b806f57dfe4c89d8ec820225297313e451b1f2c',roles:['account','absorbedBy'],dataTypes:['uint256','uint256'],amountIndex:1,category:'trading'},
  {name:'PositionTransferred',topic:'0x9ef7ab187d9803bb95074f3925951014616c7a81290d6dc51c66caf586e4e3aa',roles:['from','to','perpPool'],dataTypes:['int128','uint256'],amountIndex:1,category:'external_transfer'},
  {name:'LiquidationOrderPanicked',topic:'0xd1177677725235972bfe1d50350d338e26350c741cb33f28b0b0307c5accb451',roles:['account','perpPool'],dataTypes:['uint256'],amountIndex:null,category:'ignored'},
  {name:'MainFundedChild',topic:topics.MainFundedChild,roles:['child','payer'],dataTypes:['uint256','uint256'],amountIndex:0,category:'external_transfer'},
  {name:'IsolatedModeSet',topic:'0xefa3ddbd45a447bf6a1ef2b046cdc926ae618989f87dccd5b9ee839f4c9ea55c',roles:['account'],dataTypes:['bool'],amountIndex:null,category:'ignored'},
  {name:'MaxLeverageSet',topic:'0x31f89fb4b5140e252d8cf99dae077f2edd5560a4c1a362df6ea1325c6de25995',roles:['account','perpPool'],dataTypes:['uint16'],amountIndex:null,category:'ignored'},
  {name:'BuilderFeeCharged',topic:'0xe4f87a20bce35ff18d1a2a81f1054fae3ae0d77d322687d43fced3573a98bbdb',roles:['payer','builder','perpPool'],dataTypes:['uint256'],amountIndex:0,category:'trading'},
];

test('recognizes all eighteen published MarginBank signatures with exact indexed arity and correct amount offsets',()=>{
  assert.equal(sdkCases.length,18);
  for(const c of sdkCases){
    const log={...base,topics:[c.topic,...c.roles.map(role=>topicAddress(role==='account'||role==='child'||role==='payer'||role==='from'||role==='counterparty'?a:b))],
      data:'0x'+c.dataTypes.map((type,i)=>word(type==='bool'?1n:BigInt(11+i*23))).join('')};
    const [decoded]=decodeKnownBankFlows([log],a);
    assert.equal(decoded.kind,c.name);
    assert.equal(decoded.category,c.category,c.name);
    assert.equal(decoded.amount,c.amountIndex===null?0n:BigInt(11+c.amountIndex*23),c.name);
    assert.throws(()=>decodeKnownBankFlows([{...log,topics:log.topics.slice(0,-1)}],a),/MALFORMED_EVENT/,c.name);
    assert.throws(()=>decodeKnownBankFlows([{...log,data:log.data.slice(0,-64)}],a),/MALFORMED_EVENT/,c.name);
  }
});

test('preserves signed funding and realized PnL, without identifying negative trading amounts as transfers',()=>{
  const negative='f'.repeat(64);
  const got=decodeKnownBankFlows([
    {...base,topics:[sdkCases[0].topic,topicAddress(a),topicAddress(b)],data:'0x'+word(2n)+word(3n)+negative+word(4n)},
    {...base,logIndex:1,topics:[sdkCases[1].topic,topicAddress(a),topicAddress(b)],data:'0x'+negative},
  ],a);
  assert.equal(got[0].fields.realizedPnl,-1n);
  assert.equal(got[1].fields.payment,-1n);
  assert.deepEqual(got.map(x=>[x.category,x.amount]),[['trading',0n],['trading',0n]]);
});

test('validates narrow signed and unsigned ABI widths and boolean encoding',()=>{
  const indexed=[topicAddress(a),topicAddress(b)];
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[sdkCases[16].topic,...indexed],data:'0x'+word(65536n)}],a),/MALFORMED_EVENT/);
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[sdkCases[15].topic,topicAddress(a)],data:'0x'+word(2n)}],a),/MALFORMED_EVENT/);
  assert.throws(()=>decodeKnownBankFlows([{...base,topics:[sdkCases[0].topic,...indexed],data:'0x'+word(1n<<128n)+word(1n)+word(1n)+word(1n)}],a),/MALFORMED_EVENT/);
});

test('ADL bankrupt wallet and transfer recipient are relevant; pool, builder, insurance absorber, and source are not',()=>{
  const samples=[
    {kind:'AutoDeleveraged',topic:sdkCases[9].topic,roles:[b,b,a],data:[1n,10n]},
    {kind:'PositionTransferred',topic:sdkCases[12].topic,roles:[b,a,b],data:[1n,20n]},
  ];
  for(const c of samples){
    const decoded=decodeKnownBankFlows([{...base,topics:[c.topic,...c.roles.map(topicAddress)],data:'0x'+c.data.map(word).join('')}],a);
    assert.equal(decoded[0].kind,c.kind);
  }
  for(const index of [7,11,17]){
    const c=sdkCases[index];
    const addresses=c.roles.map(role=>role==='perpPool'||role==='absorbedBy'||role==='builder'?a:b);
    const log={...base,topics:[c.topic,...addresses.map(topicAddress)],data:'0x'+c.dataTypes.map(()=>word(1n)).join('')};
    assert.deepEqual(decodeKnownBankFlows([log],a),[],c.name);
  }
});
