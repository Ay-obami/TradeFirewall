/** A runtime-scoped readiness proof. It cannot be constructed from a caller boolean,
 * object literal or TypeScript cast. Source implementations must themselves be
 * independently audited block-pinned RPC/ledger adapters, not strategy callbacks.
 */
type Address=`0x${string}`;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const UNSIGNED=/^(0|[1-9][0-9]*)$/;
const SIGNED=/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/;
const issued=new WeakMap<object,Readonly<{scope:RiskReadinessScope;expiresAtMs:number}>>();
const denied=():never=>{throw Error('LIVE_RISK_READINESS_NOT_VERIFIED');};
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();

export interface RiskReadinessScope {
  chainId:number;account:Address;market:Address;gateAddress:Address;
  blockNumber:bigint;blockHash:Address;observedAtMs:number;
  markPriceRaw:bigint;snapshotId:string;
}
type Block={chainId:number;number:bigint;hash:Address;timestampMs:number};
type Scoped={chainId:number;account:Address;market:Address;blockNumber:bigint;blockHash:Address};
type Policy=Scoped&{version:string;maxDailyLossUsd6:string;maxSnapshotAgeMs:number};
type Loss=Scoped&{policyVersion:string;dailyPnlUsd6:string;equityUsd6:string};
type Price=Omit<Scoped,'account'>&{markPriceRaw:bigint;source:'ONCHAIN_MARK'};
type Gate=Scoped&{gateAddress:Address;contractDeployed:boolean;paused:boolean;marketEnabled:boolean;operatorAuthorized:boolean};

export interface RiskReadinessSources {
  /** Read the block by exact number and verify canonical hash from a trusted RPC. */
  readBlock(blockNumber:bigint):Promise<Block>;
  /** Each reader MUST use the exact requested block, never `latest`. */
  readPolicy(scope:RiskReadinessScope):Promise<Policy>;
  readDailyLoss(scope:RiskReadinessScope):Promise<Loss>;
  readPrice(scope:RiskReadinessScope):Promise<Price>;
  readGate(scope:RiskReadinessScope):Promise<Gate>;
  nowMs?:()=>number;
  maxAgeMs?:number;
}

export interface VerifiedRiskProof {
  readonly chainId:50383;
  readonly account:Address;
  readonly provenance:'VERIFIED_BLOCK_PINNED_RISK';
  readonly riskProvenanceVerified:true;
}

/** Runtime validation, not structural typing, makes the proof authoritative. */
export function assertVerifiedRiskProof(proof:unknown,scope:RiskReadinessScope,nowMs?:number):asserts proof is VerifiedRiskProof {
  if(!proof||typeof proof!=='object')denied();
  const bound=issued.get(proof as object);
  if(!bound||!scopeMatches(bound.scope,scope)||
    (nowMs!==undefined&&(!Number.isSafeInteger(nowMs)||nowMs>bound.expiresAtMs)))denied();
  issued.delete(proof as object); // One-use proof: no cached readiness across executions.
}

function scopeMatches(a:RiskReadinessScope,b:RiskReadinessScope):boolean {
  return a.chainId===b.chainId&&same(a.account,b.account)&&same(a.market,b.market)&&
    same(a.gateAddress,b.gateAddress)&&a.blockNumber===b.blockNumber&&same(a.blockHash,b.blockHash)&&
    a.observedAtMs===b.observedAtMs&&a.markPriceRaw===b.markPriceRaw&&a.snapshotId===b.snapshotId;
}

function matching(value:unknown,scope:RiskReadinessScope,account=true):boolean {
  if(!value||typeof value!=='object')return false;
  const v=value as Partial<Scoped>;
  return v.chainId===scope.chainId&&v.blockNumber===scope.blockNumber&&
    same(v.blockHash,scope.blockHash)&&same(v.market,scope.market)&&(!account||same(v.account,scope.account));
}

export function createVerifiedRiskReadiness(sources:RiskReadinessSources) {
  const now=sources.nowMs??Date.now;
  const maxAgeMs=sources.maxAgeMs??3000;
  if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0)denied();

  async function verify(scope:RiskReadinessScope):Promise<VerifiedRiskProof> {
    try {
      const started=now();
      if(scope?.chainId!==50383||![scope.account,scope.market,scope.gateAddress].every(a=>ADDRESS.test(a))||
        !HASH.test(scope.blockHash)||typeof scope.blockNumber!=='bigint'||scope.blockNumber<0n||
        typeof scope.markPriceRaw!=='bigint'||scope.markPriceRaw<=0n||
        scope.snapshotId!==`${scope.blockNumber}:${scope.blockHash}`||
        !Number.isSafeInteger(started)||!Number.isSafeInteger(scope.observedAtMs)||
        scope.observedAtMs>started||started-scope.observedAtMs>maxAgeMs)denied();

      const first=await sources.readBlock(scope.blockNumber);
      if(first?.chainId!==50383||first.number!==scope.blockNumber||!same(first.hash,scope.blockHash)||
        first.timestampMs!==scope.observedAtMs)denied();

      const [policy,loss,price,gate]=await Promise.all([
        sources.readPolicy(scope),sources.readDailyLoss(scope),sources.readPrice(scope),sources.readGate(scope),
      ]);
      if(!matching(policy,scope)||!matching(loss,scope)||!matching(price,scope,false)||!matching(gate,scope))denied();
      if(typeof policy.version!=='string'||!policy.version.trim()||
        !UNSIGNED.test(policy.maxDailyLossUsd6)||!Number.isSafeInteger(policy.maxSnapshotAgeMs)||
        policy.maxSnapshotAgeMs<0||started-scope.observedAtMs>policy.maxSnapshotAgeMs||
        loss.policyVersion!==policy.version||!SIGNED.test(loss.dailyPnlUsd6)||
        !UNSIGNED.test(loss.equityUsd6)||BigInt(loss.equityUsd6)<=0n||
        BigInt(loss.dailyPnlUsd6)<-BigInt(policy.maxDailyLossUsd6)||
        price.source!=='ONCHAIN_MARK'||price.markPriceRaw!==scope.markPriceRaw||
        !same(gate.gateAddress,scope.gateAddress)||!gate.contractDeployed||gate.paused||
        !gate.marketEnabled||!gate.operatorAuthorized)denied();

      // Reconfirm canonical block after all asynchronous reads and check age
      // again immediately before issuing the short-lived execute proof.
      const last=await sources.readBlock(scope.blockNumber);
      const completed=now();
      if(last?.chainId!==50383||last.number!==scope.blockNumber||!same(last.hash,scope.blockHash)||
        last.timestampMs!==scope.observedAtMs||!Number.isSafeInteger(completed)||
        completed<scope.observedAtMs||completed-scope.observedAtMs>Math.min(maxAgeMs,policy.maxSnapshotAgeMs))denied();
      const proof=Object.freeze({chainId:50383 as const,account:scope.account,
        provenance:'VERIFIED_BLOCK_PINNED_RISK' as const,riskProvenanceVerified:true as const});
      issued.set(proof,Object.freeze({scope:Object.freeze({...scope}),
        expiresAtMs:scope.observedAtMs+Math.min(maxAgeMs,policy.maxSnapshotAgeMs)}));
      return proof;
    } catch {return denied();}
  }
  return Object.freeze({verify});
}
