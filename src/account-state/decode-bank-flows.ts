/** Strict, dependency-free decoding of only SDK-verified MarginBank event layouts.
 * Unknown events and unpublished ABI layouts fail closed. This does not make PnL executable.
 */
const TOPICS:Record<string,{kind:string;roles:string[];words:number}>= {
  '0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4':{kind:'Deposited',roles:['account'],words:1},
  '0x7084f5476618d8e60b11ef0d7d3f06914655adb8793e28ff7f018d4c76d505d5':{kind:'Withdrawn',roles:['account'],words:1},
  '0x11fa725a956e1222d809b94ec211abe46e4218803a3c67d50f6fd9e46ba20a0e':{kind:'DepositedFor',roles:['account','perpPool'],words:1},
  '0x6f54bb5da6f66577f26d5a767cfee4afb2bef9f61c9a9198771744761996d241':{kind:'MainFundedChild',roles:['child','payer'],words:2},
  '0x6eab1c44b6035b703dfba0abf1e04d929563c97ec9808120fdf15a87bc118dca':{kind:'CloseOutMarginSettled',roles:['from','to'],words:1},
  '0x9d952b9056b1ad31790d622a7f5ecf49004b370b41add0e429ac1e9f4b8a3335':{kind:'CollateralLocked',roles:['account','perpPool'],words:1},
  '0x5c87c81b4945a78d177e7c3dfbc9a6eaa971757d39f3b93c514446b47b5a2e1a':{kind:'CollateralUnlocked',roles:['account','perpPool'],words:1},
};
const UNVERIFIED=new Set([
  '0xbb4e4e24c267479b5516cddb733818a304e89c317fcc3bf1af08ff3d470ca577',
  '0x841ac654b43987d16684cd677b75b4e3eae84b9139c0ce7feb0d45fcd9e5e502',
  '0x04e2caa918a69c3e0d380a68c40c5db84fc12fec03022820849786ebf5aee368',
]);
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
type RawLog={blockNumber:bigint;logIndex:number;topics:string[];data:string};
type Decoded={kind:string;amount:bigint;blockNumber:bigint;logIndex:number;
  account?:string;child?:string;payer?:string;from?:string;to?:string;perpPool?:string};

export function decodeKnownBankFlows(logs:RawLog[],account:string):Decoded[]{
  if(!ADDRESS.test(account))throw Error('INVALID_ACCOUNT');
  const result:Decoded[]=[];
  for(const log of logs){
    if(!Array.isArray(log.topics)||typeof log.topics[0]!=='string')throw Error('MALFORMED_EVENT');
    const signature=log.topics[0].toLowerCase();
    if(UNVERIFIED.has(signature))throw Error('UNVERIFIED_EVENT_ABI');
    const spec=TOPICS[signature];
    if(!spec)throw Error('UNCLASSIFIED_BANK_EVENT');
    if(log.topics.length!==spec.roles.length+1||typeof log.data!=='string'||
      !/^0x[0-9a-fA-F]*$/.test(log.data)||log.data.length!==2+spec.words*64||
      typeof log.blockNumber!=='bigint'||!Number.isSafeInteger(log.logIndex))throw Error('MALFORMED_EVENT');
    const roles:Record<string,string>={};
    for(let i=0;i<spec.roles.length;i++){
      const word=log.topics[i+1];
      if(typeof word!=='string'||!HASH.test(word)||!/^0x0{24}[0-9a-fA-F]{40}$/i.test(word))throw Error('MALFORMED_EVENT');
      roles[spec.roles[i]]='0x'+word.slice(-40);
    }
    const relevant=['account','child','payer','from','to'].some(role=>
      roles[role]?.toLowerCase()===account.toLowerCase());
    if(!relevant)continue;
    const amount=BigInt('0x'+log.data.slice(2,66));
    result.push({kind:spec.kind,amount,blockNumber:log.blockNumber,logIndex:log.logIndex,...roles});
  }
  return result;
}
