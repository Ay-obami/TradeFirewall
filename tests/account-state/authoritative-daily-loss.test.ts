import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthoritativeDailyLossReader} from '../../src/account-state/authoritative-daily-loss.ts';

const account='0xb17f4AaA37B5E73F8F453935e87278D0D7B24E1D';
const hashes=Array.from({length:8},(_,i)=>'0x'+(i+1).toString(16).padStart(64,'0'));
const times=[86200n,86300n,86399n,86400n,86401n,86450n,86500n,87000n];
const bank='0x478769E1177C0773c43A593DCCc4Ad15F15F1394';
const word=(n:bigint)=>n.toString(16).padStart(64,'0');
const deposit={address:bank,blockNumber:'0x5',blockHash:hashes[5],logIndex:'0x0',transactionHash:'0x'+'a'.repeat(64),
  topics:['0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4','0x'+account.slice(2).toLowerCase().padStart(64,'0')],
  data:'0x'+word(50n),removed:false};
function deps(logs:any[]=[deposit],endEquity=970n){
  return {
    readMarginEquity:async(_:string,who:string,at:bigint)=>{
      assert.equal(who.toLowerCase(),account.toLowerCase());
      return {equity:at===2n?1000n:endEquity,lockedCollateral:0n,asOfBlock:at};
    },
    rpc:async(method:string,params:unknown[])=>{
      if(method==='eth_chainId')return '0xc4cf';
      if(method==='eth_getBlockByNumber'){
        const n=Number(BigInt(params[0] as string));
        return {number:'0x'+n.toString(16),hash:hashes[n],timestamp:'0x'+times[n].toString(16)};
      }
      if(method==='eth_getLogs')return logs.filter(e=>BigInt(e.blockNumber)>=BigInt((params[0] as any).fromBlock)&&BigInt(e.blockNumber)<=BigInt((params[0] as any).toBlock));
      throw Error('Unexpected RPC');
    },
  };
}

test('negative net PnL from historical UTC baseline and external deposit stays non-executable without flow and USD proofs',async()=>{
  // 970 - 1000 - 50 = -80 raw, NOT -80 USD6.
  const got=await createAuthoritativeDailyLossReader(deps()).read({account,asOfBlock:7n});
  assert.equal(got.status,'UNAVAILABLE');
  assert.equal(got.riskExecutable,false);
  assert.equal(got.dailyLossUsd6,null);
  assert.equal(got.dailyPnlUsd6,null);
  assert.equal(got.provisional?.tradingPnlRaw,-80n);
  assert.equal(got.provisional?.baselineBlock,2n);
  assert.equal(got.provisional?.utcDayStartSec,86400n);
  assert.deepEqual(got.blockers,['UNPROVEN_COMPLETE_EXTERNAL_FLOW_SEMANTICS','UNVERIFIED_COLLATERAL_USD_UNITS']);
});

test('apparent profit and zero movement do not bypass missing authority',async()=>{
  for(const equity of [1050n,1000n]){
    const got=await createAuthoritativeDailyLossReader(deps([],equity)).read({account,asOfBlock:7n});
    assert.equal(got.status,'UNAVAILABLE');
    assert.equal(got.dailyLossUsd6,null);
    assert.equal(got.riskExecutable,false);
  }
});

test('unknown bank event prevents a provisional number and returns a fail-closed result',async()=>{
  const unknown={...deposit,topics:['0x'+'f'.repeat(64),deposit.topics[1]]};
  const got=await createAuthoritativeDailyLossReader(deps([unknown])).read({account,asOfBlock:7n});
  assert.equal(got.status,'UNAVAILABLE');
  assert.equal(got.provisional,null);
  assert.equal(got.dailyLossUsd6,null);
  assert.deepEqual(got.blockers,['PROVISIONAL_RECONCILIATION_FAILED']);
  assert.equal(got.detail,'UNCLASSIFIED_BANK_EVENT');
});

test('missing pre-midnight baseline cannot silently become a zero-loss permit',async()=>{
  const got=await createAuthoritativeDailyLossReader(deps()).read({account,asOfBlock:0n});
  assert.equal(got.status,'UNAVAILABLE');
  assert.equal(got.riskExecutable,false);
  assert.equal(got.dailyLossUsd6,null);
  assert.equal(got.detail,'INVALID_BLOCK');
});
