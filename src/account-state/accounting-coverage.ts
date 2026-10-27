/** Read-only accounting-evidence inventory, NOT an accounting authority.
 * Domain attestations below are caller-supplied and cannot independently prove
 * exhaustive contract inventory, historical receipts, economics or USD6 units.
 * Even a fully populated inventory must remain fail-closed until an independently
 * authenticated provenance/valuation pipeline is built and reviewed.
 */

export const ACCOUNTING_DOMAINS=Object.freeze([
  'deposits_withdrawals', 'funding', 'fees', 'liquidations', 'positions',
  'vouchers', 'funded_principal', 'internal_collateral', 'cross_account_transfers',
] as const);
type Domain=typeof ACCOUNTING_DOMAINS[number];
type Evidence={domain:string;source:string;chainId:number;account:string;
  fromExclusive:bigint;toInclusive:bigint;baselineHash:string;currentHash:string;
  eventAbiAttested:boolean;contractInventoryAttested:boolean;
  economicSemanticsAttested:boolean;crossContractReceiptsReconciled:boolean;
  unknownEvents:number;unresolvedReceipts:number};
type Input={account:string;fromExclusive:bigint;toInclusive:bigint; evidence:Evidence[]};
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;

export function assessAccountingCoverage(input:Input) {
  if(!input||!ADDRESS.test(input.account)||typeof input.fromExclusive!=='bigint'||
    typeof input.toInclusive!=='bigint'||input.fromExclusive<0n||
    input.toInclusive<=input.fromExclusive||!Array.isArray(input.evidence))
    throw Error('INVALID_COVERAGE_INPUT');

  const seen=new Set<string>();
  const globalBlockers:string[]=[];
  const snapshotPairs=new Set<string>();
  for(const row of input.evidence){
    if(!row||typeof row.domain!=='string'||!ACCOUNTING_DOMAINS.some(d=>d===row.domain)){
      if(!globalBlockers.includes('UNKNOWN_ACCOUNTING_DOMAIN'))globalBlockers.push('UNKNOWN_ACCOUNTING_DOMAIN');
      continue;
    }
    if(seen.has(row.domain)&&!globalBlockers.includes('DUPLICATE_DOMAIN_EVIDENCE'))
      globalBlockers.push('DUPLICATE_DOMAIN_EVIDENCE');
    seen.add(row.domain);
    if(HASH.test(row.baselineHash)&&HASH.test(row.currentHash))
      snapshotPairs.add(`${row.baselineHash.toLowerCase()}:${row.currentHash.toLowerCase()}`);
  }
  if(snapshotPairs.size>1)globalBlockers.push('INCONSISTENT_SNAPSHOT_HASHES');
  const domains=ACCOUNTING_DOMAINS.map(domain=>{
    const candidates=input.evidence.filter(row=>row?.domain===domain);
    const row=candidates.length===1?candidates[0]:undefined;
    const blockers:string[]=[];
    if(!row)blockers.push(candidates.length?'DUPLICATE_DOMAIN_EVIDENCE':'MISSING_DOMAIN_EVIDENCE');
    else {
      if(row.source!=='VERIFIED_CHAIN_LOGS'||row.chainId!==50383)blockers.push('UNVERIFIED_SOURCE');
      if(!same(row.account,input.account))blockers.push('ACCOUNT_MISMATCH');
      if(row.fromExclusive!==input.fromExclusive||row.toInclusive!==input.toInclusive)blockers.push('RANGE_MISMATCH');
      if(!HASH.test(row.baselineHash)||!HASH.test(row.currentHash))blockers.push('INVALID_BLOCK_HASH');
      if(row.eventAbiAttested!==true)blockers.push('EVENT_ABI_UNATTESTED');
      if(row.contractInventoryAttested!==true)blockers.push('CONTRACT_INVENTORY_UNATTESTED');
      if(row.economicSemanticsAttested!==true)blockers.push('ECONOMIC_SEMANTICS_UNATTESTED');
      if(row.crossContractReceiptsReconciled!==true)blockers.push('CROSS_CONTRACT_RECEIPTS_UNRECONCILED');
      if(!count(row.unknownEvents)||!count(row.unresolvedReceipts))blockers.push('INVALID_COUNTS');
      else {
        if(row.unknownEvents>0)blockers.push('UNKNOWN_EVENTS');
        if(row.unresolvedReceipts>0)blockers.push('UNRESOLVED_RECEIPTS');
      }
    }
    return Object.freeze({domain,claimedCovered:blockers.length===0,
      blockers:Object.freeze(blockers)});
  });
  const missingDomains=domains.filter(d=>d.blockers.includes('MISSING_DOMAIN_EVIDENCE')).map(d=>d.domain);
  const evidenceClaimsComplete=globalBlockers.length===0&&domains.every(d=>d.claimedCovered);
  const blockers=Object.freeze([...globalBlockers,
    ...(!evidenceClaimsComplete?['INCOMPLETE_ACCOUNTING_DOMAIN_EVIDENCE']:[]),
    'INDEPENDENT_CROSS_CONTRACT_PROVENANCE_NOT_VERIFIED',
    'USD6_COLLATERAL_VALUATION_NOT_VERIFIED']);
  return Object.freeze({account:input.account,fromExclusive:input.fromExclusive,
    toInclusive:input.toInclusive,domains:Object.freeze(domains),
    missingDomains:Object.freeze(missingDomains),blockers,
    evidenceClaimsComplete,complete:false as const,
    authority:'DIAGNOSTIC_ONLY_UNVERIFIED_ACCOUNTING_COVERAGE' as const,
    collateralUnits:'RAW_UNVERIFIED_QUOTE' as const,
    dailyPnlUsd6:null,dailyLossUsd6:null,riskExecutable:false as const});
}
