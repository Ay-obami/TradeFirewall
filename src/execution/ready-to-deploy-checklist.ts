/** Gas-free, read-only assessment of *supplied* evidence. It makes no RPC calls,
 * signs no transactions and never interprets gate state as live trade proof.
 * Obtain gate evidence from the block-pinned createGateChainStateReader.
 */
export type CheckStatus='ready'|'blocked'|'unverified';
export type ReadinessCheck=Readonly<{status:CheckStatus;reason:string}>;
export type GateEvidence=Readonly<{
  chainId:number; address:string; tradingOwner:string; bot:string;
  contractDeployed:boolean; paused:boolean; marketEnabled:boolean;
  operatorAuthorized:boolean; blockHash:string;
  marketLimits:Readonly<{maxQuantityRaw:bigint;minPriceRaw:bigint;maxPriceRaw:bigint}>;
  remainingGrossQuantityRaw:bigint;
}>;
export type DeploymentEvidence={
  funding?:{balanceWei:bigint;minimumGasWei:bigint};
  admin?:{authorized:boolean};
  gate?:GateEvidence;
  expected?:{owner:string;bot:string};
  risk?:{approved:boolean;blockHash:string};
};

const ready=(reason:string):ReadinessCheck=>({status:'ready',reason});
const blocked=(reason:string):ReadinessCheck=>({status:'blocked',reason});
const unverified=(reason:string):ReadinessCheck=>({status:'unverified',reason});
const ADDRESS=/^0x[\da-fA-F]{40}$/;
const HASH=/^0x[\da-fA-F]{64}$/;

export function assessDeploymentReadiness(input:DeploymentEvidence){
  const f=input.funding;
  const funding:ReadinessCheck=!f ? unverified('balance and minimum gas budget not supplied')
    :typeof f.balanceWei!=='bigint'||typeof f.minimumGasWei!=='bigint'||f.balanceWei<0n||f.minimumGasWei<=0n
      ?blocked('invalid gas budget evidence')
      :f.balanceWei<f.minimumGasWei ? blocked('insufficient gas balance'):ready('gas balance meets supplied minimum');
  const admin:ReadinessCheck=typeof input.admin?.authorized!=='boolean'
    ?unverified('admin authorization not verified')
    :input.admin.authorized?ready('admin authorization attested'):blocked('admin authorization denied');

  const g=input.gate;
  const operator:ReadinessCheck=typeof g?.operatorAuthorized!=='boolean'
    ?unverified('on-chain operator permission not verified')
    :g.operatorAuthorized?ready('pool operator permission observed'):blocked('pool operator permission denied');

  let gate:ReadinessCheck;
  if(!g||!input.expected) gate=unverified('block-pinned gate evidence and expected identities required');
  else if(g.chainId!==50383||!ADDRESS.test(g.address)||!ADDRESS.test(input.expected.owner)||
    !ADDRESS.test(input.expected.bot)||!HASH.test(g.blockHash)||
    !ADDRESS.test(g.tradingOwner)||!ADDRESS.test(g.bot)||
    g.tradingOwner.toLowerCase()!==input.expected.owner.toLowerCase()||
    g.bot.toLowerCase()!==input.expected.bot.toLowerCase()||
    !g.contractDeployed||g.paused||!g.marketEnabled||
    typeof g.marketLimits?.maxQuantityRaw!=='bigint'||g.marketLimits.maxQuantityRaw<=0n||
    typeof g.marketLimits?.minPriceRaw!=='bigint'||g.marketLimits.minPriceRaw<=0n||
    typeof g.marketLimits?.maxPriceRaw!=='bigint'||g.marketLimits.maxPriceRaw<g.marketLimits.minPriceRaw||
    typeof g.remainingGrossQuantityRaw!=='bigint'||g.remainingGrossQuantityRaw<=0n)
    gate=blocked('gate chain, identity, deployment, pause, market or limits invalid');
  else gate=ready('gate identity and market controls verified');

  const r=input.risk;
  const risk:ReadinessCheck=!r?unverified('independent risk approval not supplied')
    :typeof r.approved!=='boolean'||!HASH.test(r.blockHash)||!g||!HASH.test(g.blockHash)
      ?blocked('invalid or unanchored risk evidence')
      :r.blockHash.toLowerCase()!==g.blockHash.toLowerCase()
        ?blocked('risk approval refers to a different block')
        :r.approved?ready('risk approval bound to gate block'):blocked('risk approval denied');

  const checks=Object.freeze({funding,admin,operator,gate,risk});
  const blockers=Object.entries(checks).filter(([,check])=>check.status!=='ready')
    .map(([name,check])=>`${name}: ${check.reason}`);
  return Object.freeze({mode:'GAS_FREE_READ_ONLY_CHECKLIST' as const,checks,blockers,
    readyForDeployment:blockers.length===0,readyForTrading:false as const});
}
