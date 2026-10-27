import assert from 'node:assert/strict';
import test from 'node:test';
import {createVerifiedRiskReadiness,assertVerifiedRiskProof} from '../../src/integration/verified-risk-readiness.ts';
import {createGateChainStateReader} from '../../src/execution/gate-chain-state.ts';
import {createGateExecutionPort} from '../../src/execution/gate-execution.ts';
import {reconcileDailyEquity} from '../../src/account-state/daily-equity-reconciliation.ts';
import {collectMarginBankLogs} from '../../src/account-state/margin-bank-log-collector.ts';

const account='0x1111111111111111111111111111111111111111' as const;
const bot='0x2222222222222222222222222222222222222222' as const;
const gate='0x3333333333333333333333333333333333333333' as const;
const market='0x4444444444444444444444444444444444444444' as const;
const hash=`0x${'a'.repeat(64)}` as const;
const otherHash=`0x${'b'.repeat(64)}` as const;
const scope={chainId:50383,account,market,gateAddress:gate,blockNumber:100n,
  blockHash:hash,observedAtMs:1_000,markPriceRaw:100n,snapshotId:`100:${hash}`};
const pinned={chainId:50383,account,market,blockNumber:100n,blockHash:hash};
const word=(n:bigint)=>n.toString(16).padStart(64,'0');
const addressWord=(a:string)=>a.slice(2).padStart(64,'0');

function readiness(options:{clock?:()=>number;blockHashes?:string[];operatorAuthorized?:boolean}={}) {
  let reads=0;
  return createVerifiedRiskReadiness({
    nowMs:options.clock??(()=>1_100),maxAgeMs:500,
    readBlock:async()=>({chainId:50383,number:100n,hash:(options.blockHashes??[hash])[Math.min(reads++,(options.blockHashes??[hash]).length-1)] as typeof hash,timestampMs:1_000}),
    readPolicy:async()=>({...pinned,version:'v1',maxDailyLossUsd6:'100',maxSnapshotAgeMs:500}),
    readDailyLoss:async()=>({...pinned,policyVersion:'v1',dailyPnlUsd6:'-20',equityUsd6:'1000'}),
    readPrice:async()=>({chainId:50383,market,blockNumber:100n,blockHash:hash,markPriceRaw:100n,source:'ONCHAIN_MARK' as const}),
    readGate:async()=>({...pinned,gateAddress:gate,contractDeployed:true,paused:false,marketEnabled:true,operatorAuthorized:options.operatorAuthorized??true}),
  });
}

test('reorg between first and second canonical-block checks never issues a risk proof',async()=>{
  await assert.rejects(readiness({blockHashes:[hash,otherHash]}).verify(scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});

test('risk proof fails on stale completion even when the first block read was fresh',async()=>{
  let reads=0;
  const verifier=readiness({clock:()=>++reads===1?1_100:1_501});
  await assert.rejects(verifier.verify(scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});

test('contradictory operator read denies readiness even when all other checks are healthy',async()=>{
  await assert.rejects(readiness({operatorAuthorized:false}).verify(scope),/LIVE_RISK_READINESS_NOT_VERIFIED/);
  const proof=await readiness().verify(scope);
  assert.throws(()=>assertVerifiedRiskProof(proof,{...scope,gateAddress:bot}),/LIVE_RISK_READINESS_NOT_VERIFIED/);
});

test('chain gate preflight rejects a direct bot operator bypass despite gate approval',async()=>{
  const calls:Array<{method:string;params:unknown[]}>=[];
  const rpc=async(method:string,params:unknown[]):Promise<unknown>=>{
    calls.push({method,params});
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_blockNumber')return '0x64';
    if(method==='eth_getBlockByNumber')return {number:'0x64',hash};
    if(method==='eth_getCode')return '0x6000';
    if(method!=='eth_call')throw Error(`unexpected ${method}`);
    const {data}=params[0] as {data:string};
    const selector=data.slice(0,10);
    if(selector==='0x10814c37')return '0x'+addressWord(bot);
    if(selector==='0x18101ea3')return '0x'+addressWord(account);
    if(selector==='0x5c975abb')return '0x'+word(0n);
    if(selector==='0x8e8f294b')return '0x'+word(1n)+word(100n)+word(10n)+word(1000n);
    if(selector==='0x1ce56593')return '0x'+word(100n);
    if(selector==='0x72c06959')return '0x'+word(0n);
    if(selector==='0xa8cb3794')return '0x'+word(1n); // Both gate and bot authorized: unsafe.
    throw Error(`unexpected selector ${selector}`);
  };
  await assert.rejects(createGateChainStateReader({rpc,gateAddress:gate,pool:market,owner:account,bot}).read(),/DIRECT_BOT_OPERATOR_BYPASS/);
  const permissionCalls=calls.filter(c=>c.method==='eth_call'&&
    ((c.params[0] as {data:string}).data.startsWith('0xa8cb3794')));
  assert.equal(permissionCalls.length,2);
  assert.ok(permissionCalls.every(c=>c.params[1]==='0x64'));
});

test('an unclassified liquidation flow cannot be silently treated as zero funding flow',()=>{
  const input={
    baseline:{account,blockNumber:10n,timestampSec:10n,equityRaw:1_000n},
    current:{account,blockNumber:20n,timestampSec:20n,equityRaw:700n},
    coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},
  };
  assert.throws(()=>reconcileDailyEquity({...input,events:[{kind:'LiquidationSettled',amount:300n,
    blockNumber:15n,logIndex:0,account}]}),/UNCLASSIFIED_BALANCE_EVENT/);
  assert.throws(()=>reconcileDailyEquity({...input,events:[],coverage:{complete:false,source:'VERIFIED_CHAIN_LOGS'}}),
    /INCOMPLETE_LOG_COVERAGE/);
  assert.equal(reconcileDailyEquity({...input,events:[]}).riskExecutable,false);
});

test('duplicate chain events reject reconciliation rather than double-counting equity movements',()=>{
  const event={kind:'Deposited',amount:100n,blockNumber:15n,logIndex:3,account};
  assert.throws(()=>reconcileDailyEquity({
    baseline:{account,blockNumber:10n,timestampSec:10n,equityRaw:1_000n},
    current:{account,blockNumber:20n,timestampSec:20n,equityRaw:1_200n},
    coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},events:[event,{...event,amount:200n}],
  }),/DUPLICATE_EVENT/);
});

for(const kind of ['MainFundedChild','FundedPrincipalReturned'])test(`${kind} rejects self-transfer that would fabricate external cash flow`,()=>{
  const baseline={account,blockNumber:10n,timestampSec:10n,equityRaw:1_000n};
  const current={account,blockNumber:20n,timestampSec:20n,equityRaw:1_000n};
  // A self-transfer has no external counterparty. Ambiguous accounting must
  // fail closed rather than assigning a one-sided positive/negative flow.
  assert.throws(()=>reconcileDailyEquity({baseline,current,
    coverage:{complete:true,source:'VERIFIED_CHAIN_LOGS'},
    events:[{kind,amount:100n,blockNumber:15n,logIndex:0,child:account,payer:account}],
  }),/AMBIGUOUS_SELF_TRANSFER|INVALID_SELF_TRANSFER/);
});

test('duplicate RPC logs are rejected before accounting despite apparently complete ranges',async()=>{
  const event={address:'0x478769E1177C0773c43A593DCCc4Ad15F15F1394',
    blockNumber:'0xb',blockHash:hash,transactionHash:otherHash,logIndex:'0x0',topics:[hash],data:'0x',removed:false};
  const rpc=async(method:string):Promise<unknown>=>{
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_getLogs')return [event,event];
    throw Error(`unexpected ${method}`);
  };
  // Block response varies with request, as a real block-number-pinned RPC would.
  const pinnedRpc=async(method:string,params:unknown[])=>method==='eth_getBlockByNumber'
    ?{number:params[0],hash}:rpc(method);
  await assert.rejects(collectMarginBankLogs({rpc:pinnedRpc,fromExclusive:10n,toInclusive:11n}),/DUPLICATE_LOG/);
});

test('log collection denies a mid-scan canonical reorg and cannot certify funding risk',async()=>{
  let blockReads=0;
  const rpc=async(method:string,params:unknown[]):Promise<unknown>=>{
    if(method==='eth_chainId')return '0xc4cf';
    if(method==='eth_getBlockByNumber')return {number:params[0],hash:++blockReads>2?otherHash:hash};
    if(method==='eth_getLogs')return [];
    throw Error(`unexpected ${method}`);
  };
  await assert.rejects(collectMarginBankLogs({rpc,fromExclusive:10n,toInclusive:11n}),/REORG_DETECTED/);
  blockReads=0;
  const stableRpc=async(method:string,params:unknown[])=>method==='eth_getBlockByNumber'
    ?{number:params[0],hash}:rpc(method,params);
  const collected=await collectMarginBankLogs({rpc:stableRpc,fromExclusive:10n,toInclusive:11n});
  assert.equal(collected.coverage.complete,true);
  assert.equal(collected.riskExecutable,false);
});

test('interrupted and malformed gate broadcasts never permit an automatic second send',async()=>{
  const intent={account,market,side:'buy' as const,orderType:'limit' as const,
    priceRaw:100n,quantityRaw:10n,clientOrderId:'ambiguous-write'};
  for(const response of ['throw','hashless'] as const){
    let sends=0;
    const port=createGateExecutionPort({chainId:50383,botWalletAddress:bot,tradingOwner:account,
      gateAddress:gate,nowMs:()=>1_000_000,
      lookupMarket:async()=>({chainId:50383,pool:market,tickSize:10n,lotSize:5n,
        minQuantity:5n,maxQuantity:100n,minPriceRaw:10n,maxPriceRaw:1000n}),
      resolveOrderFields:async()=>({userData:7n,expireTimestampNs:1_200_000_000_000n,
        nonce:7n,deadlineSec:1_100n,orderType:0,selfMatchingOption:0}),
      readGateState:async()=>({chainId:50383,address:gate,bot,tradingOwner:account,paused:false,
        contractDeployed:true,marketEnabled:true,operatorAuthorized:true}),
      sendGateOrder:async()=>{sends++;if(response==='throw')throw Error('transport disconnected');return {};},
    });
    await assert.rejects(port.submitOrder(intent),/AMBIGUOUS_BROADCAST/);
    await assert.rejects(port.submitOrder(intent),/DUPLICATE_INTENT/);
    assert.equal(sends,1);
  }
});
