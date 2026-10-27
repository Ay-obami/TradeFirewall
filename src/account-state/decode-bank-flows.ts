/** Strict MarginBank raw-log decoding. SDK provenance: npm
 * @somnia-chain/markets-sdk@0.32.1 package/src/eventsAbi.ts, topic0 computed
 * from its canonical event signatures with Keccak-256. Voucher topics are
 * separately verified on deployed Hideki. Values are RAW units, NEVER USD.
 */
import {classifyBankEvent} from './bank-event-classification.ts';

type Word='uint256'|'int256'|'uint128'|'int128'|'uint16'|'bool';
type Spec={name:string;roles:string[];fields:[string,Word][];amountField:string|null;category:string;relevant:string[]};
const sdk=(name:string,roles:string[],fields:[string,Word][],relevant:string[]):Spec=>{
  const c=classifyBankEvent(name);
  return {name,roles,fields,relevant,amountField:c.amountField,category:c.category};
};
const voucher=(name:string,roles:string[],fields:[string,Word][],relevant:string[]):Spec=>
  ({name,roles,fields,relevant,amountField:'amount',category:'voucher'});
const TOPICS:Record<string,Spec>={
  '0xf7816a375f0ca01053ed213b57908bff79f578810301d50971a5f685529b82de':sdk('PositionUpdated',['account','perpPool'],[['newSize','int128'],['avgEntryPrice','uint128'],['realizedPnl','int256'],['entryFundingIndex','int256']],['account']),
  '0xa15061682858c3fa114522ab30e2d34c3454420d616b62130925b9ee2631ca85':sdk('FundingSettled',['account','perpPool'],[['payment','int256']],['account']),
  '0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4':sdk('Deposited',['account'],[['amount','uint256']],['account']),
  '0x11fa725a956e1222d809b94ec211abe46e4218803a3c67d50f6fd9e46ba20a0e':sdk('DepositedFor',['account','perpPool'],[['amount','uint256']],['account']),
  '0x7084f5476618d8e60b11ef0d7d3f06914655adb8793e28ff7f018d4c76d505d5':sdk('Withdrawn',['account'],[['amount','uint256']],['account']),
  '0x9d952b9056b1ad31790d622a7f5ecf49004b370b41add0e429ac1e9f4b8a3335':sdk('CollateralLocked',['account','perpPool'],[['amount','uint256']],['account']),
  '0x5c87c81b4945a78d177e7c3dfbc9a6eaa971757d39f3b93c514446b47b5a2e1a':sdk('CollateralUnlocked',['account','perpPool'],[['amount','uint256']],['account']),
  '0x2a2899ae8177fb54d81544d727d24141bf8fd23e78e721fe56cda337d397044b':sdk('FeeCharged',['account','perpPool'],[['amount','uint256'],['insurancePortion','uint256']],['account']),
  '0xb5ec5e03662403108373ab6431d3e834cb1011fca164541aef315fc7dea7b3b6':sdk('RebatePaid',['account','perpPool'],[['amount','uint256']],['account']),
  '0x08fcdd8dbc6e7103f6145428f23ce550dd730383de88b64e748f6700486fb6cf':sdk('AutoDeleveraged',['counterparty','perpPool','bankrupt'],[['sizeReduced','int128'],['bankruptcyPrice','uint256']],['counterparty','bankrupt']),
  '0x6eab1c44b6035b703dfba0abf1e04d929563c97ec9808120fdf15a87bc118dca':sdk('CloseOutMarginSettled',['from','to'],[['amount','uint256']],['from','to']),
  '0x6392407d3767368407133def2b806f57dfe4c89d8ec820225297313e451b1f2c':sdk('BadDebtAbsorbed',['account','absorbedBy'],[['badDebt','uint256'],['covered','uint256']],['account']),
  '0x9ef7ab187d9803bb95074f3925951014616c7a81290d6dc51c66caf586e4e3aa':sdk('PositionTransferred',['from','to','perpPool'],[['size','int128'],['collateralTransferred','uint256']],['from','to']),
  '0xd1177677725235972bfe1d50350d338e26350c741cb33f28b0b0307c5accb451':sdk('LiquidationOrderPanicked',['account','perpPool'],[['panicCode','uint256']],['account']),
  '0x6f54bb5da6f66577f26d5a767cfee4afb2bef9f61c9a9198771744761996d241':sdk('MainFundedChild',['child','payer'],[['amount','uint256'],['outstandingPrincipal','uint256']],['child','payer']),
  '0xefa3ddbd45a447bf6a1ef2b046cdc926ae618989f87dccd5b9ee839f4c9ea55c':sdk('IsolatedModeSet',['account'],[['enabled','bool']],['account']),
  '0x31f89fb4b5140e252d8cf99dae077f2edd5560a4c1a362df6ea1325c6de25995':sdk('MaxLeverageSet',['account','perpPool'],[['leverageX','uint16']],['account']),
  '0xe4f87a20bce35ff18d1a2a81f1054fae3ae0d77d322687d43fced3573a98bbdb':sdk('BuilderFeeCharged',['payer','builder','perpPool'],[['amount','uint256']],['payer']),
  '0xbb4e4e24c267479b5516cddb733818a304e89c317fcc3bf1af08ff3d470ca577':voucher('AccountCredited',['account','source'],[['amount','uint256']],['account']),
  '0x841ac654b43987d16684cd677b75b4e3eae84b9139c0ce7feb0d45fcd9e5e502':voucher('CreditReclaimed',['account','source'],[['amount','uint256']],['account']),
  '0x04e2caa918a69c3e0d380a68c40c5db84fc12fec03022820849786ebf5aee368':voucher('FundedPrincipalReturned',['child','payer'],[['amount','uint256'],['outstandingPrincipal','uint256']],['child','payer']),
};

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
type RawLog={blockNumber:bigint;logIndex:number;topics:string[];data:string};
type Decoded={kind:string;category:string;amount:bigint;fields:Readonly<Record<string,bigint|boolean>>;
  blockNumber:bigint;logIndex:number;account?:string;child?:string;payer?:string;from?:string;to?:string;
  perpPool?:string;source?:string;counterparty?:string;bankrupt?:string;absorbedBy?:string;builder?:string};

function decodeWord(hex:string,type:Word):bigint|boolean {
  let value=BigInt('0x'+hex);
  if(type==='bool'){
    if(value>1n)throw Error('MALFORMED_EVENT');
    return value===1n;
  }
  if(type.startsWith('uint')){
    if(value>=1n<<BigInt(type.slice(4)))throw Error('MALFORMED_EVENT');
    return value;
  }
  const width=BigInt(type.slice(3));
  if(value & (1n<<255n))value-=1n<<256n;
  if(value<-(1n<<(width-1n))||value>=(1n<<(width-1n)))throw Error('MALFORMED_EVENT');
  return value;
}

export function decodeKnownBankFlows(logs:RawLog[],account:string):Decoded[]{
  if(!ADDRESS.test(account))throw Error('INVALID_ACCOUNT');
  const result:Decoded[]=[];
  for(const log of logs){
    if(!Array.isArray(log.topics)||typeof log.topics[0]!=='string')throw Error('MALFORMED_EVENT');
    const spec=TOPICS[log.topics[0].toLowerCase()];
    if(!spec)throw Error('UNCLASSIFIED_BANK_EVENT');
    if(log.topics.length!==spec.roles.length+1||typeof log.data!=='string'||
      !/^0x[0-9a-fA-F]*$/.test(log.data)||log.data.length!==2+spec.fields.length*64||
      typeof log.blockNumber!=='bigint'||log.blockNumber<0n||
      !Number.isSafeInteger(log.logIndex)||log.logIndex<0)throw Error('MALFORMED_EVENT');
    const roles:Record<string,string>={};
    for(let i=0;i<spec.roles.length;i++){
      const word=log.topics[i+1];
      if(typeof word!=='string'||!HASH.test(word)||!/^0x0{24}[0-9a-fA-F]{40}$/i.test(word))throw Error('MALFORMED_EVENT');
      roles[spec.roles[i]]='0x'+word.slice(-40);
    }
    const fields:Record<string,bigint|boolean>={};
    for(let i=0;i<spec.fields.length;i++){
      const [name,type]=spec.fields[i];
      fields[name]=decodeWord(log.data.slice(2+i*64,66+i*64),type);
    }
    if(!spec.relevant.some(role=>roles[role]?.toLowerCase()===account.toLowerCase()))continue;
    // Signed funding is trading evidence, not a positive external cash flow.
    const amount=spec.name==='FundingSettled'||spec.amountField===null?0n:fields[spec.amountField];
    if(typeof amount!=='bigint'||amount<0n)throw Error('MALFORMED_EVENT');
    result.push({kind:spec.name,category:spec.category,amount,fields:Object.freeze(fields),
      blockNumber:log.blockNumber,logIndex:log.logIndex,...roles});
  }
  return result;
}
