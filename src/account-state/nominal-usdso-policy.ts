/** A testnet-only, nominal USDso-denominated unadjusted equity decline alert.
 *
 * This is NOT a USD valuation: the 18-decimal collateral's nominal amount
 * cannot establish a redeemable dollar peg or a fiat/USD risk budget.
 * Equity changes include deposits, withdrawals and voucher credits. With no
 * independently authenticated, complete external-flow correction, they MUST
 * NOT be represented as daily PnL/loss. Ordered blocks also do not prove a
 * UTC-day start boundary. The alert never grants trading authority.
 */
const COLLATERAL='0xed7993A74dAe1e6656B704A424DcD8711aAf4F72';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const SCALE=1_000_000_000_000n;

type HistoricalEquity={
  account:string;chainId:number;blockNumber:bigint;blockHash:string;equityRaw:bigint;
  authority:string;riskExecutable:boolean;
};
type CollateralIdentity={
  chainId:number;blockNumber:bigint;blockHash:string;collateralAddress:string;
  collateralDecimals:number;authority:string;riskExecutable:boolean;
};

/** Require historical chain reads at both boundaries; their difference is an
 * unadjusted observation, not an authoritative daily-loss calculation.
 */
export function evaluateNominalUsdso6EquityDeclineAlert(input:{
  account:string;startEquity:HistoricalEquity;endEquity:HistoricalEquity;
  collateralIdentity:CollateralIdentity;nominalDeclineAlertThreshold6:bigint;
}){
  const {startEquity:start,endEquity:end,collateralIdentity:identity}=input;
  if(typeof input.nominalDeclineAlertThreshold6!=='bigint'||input.nominalDeclineAlertThreshold6<0n)
    throw Error('INVALID_NOMINAL_LIMIT');
  for(const snapshot of [start,end]){
    if(!snapshot||snapshot.authority!=='VERIFIED_HISTORICAL_CHAIN_READ'||
      typeof snapshot.equityRaw!=='bigint'||typeof snapshot.blockNumber!=='bigint'||
      snapshot.blockNumber<0n||typeof snapshot.blockHash!=='string'||!HASH.test(snapshot.blockHash))
      throw Error('UNVERIFIED_HISTORICAL_EQUITY');
    if(snapshot.chainId!==50383)throw Error('WRONG_CHAIN');
  }
  if(!ADDRESS.test(input.account)||start.account.toLowerCase()!==input.account.toLowerCase()||
    end.account.toLowerCase()!==input.account.toLowerCase())throw Error('EQUITY_ACCOUNT_MISMATCH');
  if(start.blockNumber>=end.blockNumber)throw Error('INVALID_EQUITY_ORDER');
  if(!identity||identity.chainId!==50383||identity.authority!=='BLOCK_PINNED_PERPS_COLLATERAL_IDENTITY'||
    identity.collateralDecimals!==18||typeof identity.collateralAddress!=='string'||
    identity.collateralAddress.toLowerCase()!==COLLATERAL.toLowerCase()||
    typeof identity.blockNumber!=='bigint'||typeof identity.blockHash!=='string'||!HASH.test(identity.blockHash))
    throw Error('UNVERIFIED_USDSO_IDENTITY');
  if(identity.blockNumber!==end.blockNumber||identity.blockHash.toLowerCase()!==end.blockHash.toLowerCase())
    throw Error('IDENTITY_BLOCK_MISMATCH');

  const delta=end.equityRaw-start.equityRaw;
  // Floor positive equity changes; round negative changes away from zero so
  // even a fractional decline triggers a conservative nominal observation.
  const unadjustedEquityDeltaNominalUsdso6=delta>=0n?delta/SCALE:-((-delta+SCALE-1n)/SCALE);
  const unadjustedDeclineNominalUsdso6=unadjustedEquityDeltaNominalUsdso6<0n?-unadjustedEquityDeltaNominalUsdso6:0n;
  return Object.freeze({
    account:input.account,chainId:50383 as const,asOfBlock:end.blockNumber,
    collateralAddress:COLLATERAL,unit:'NOMINAL_USDSO6' as const,
    unadjustedEquityDeltaNominalUsdso6:unadjustedEquityDeltaNominalUsdso6.toString(),
    unadjustedDeclineNominalUsdso6:unadjustedDeclineNominalUsdso6.toString(),
    nominalDeclineAlertThreshold6:input.nominalDeclineAlertThreshold6.toString(),
    exceedsUnadjustedDeclineAlertThreshold:unadjustedDeclineNominalUsdso6>input.nominalDeclineAlertThreshold6,
    authority:'UNADJUSTED_EQUITY_DELTA_HEURISTIC' as const,
    pnlAuthority:'NOT_ESTABLISHED' as const,lossAuthority:'NOT_ESTABLISHED' as const,
    utcDayBoundaryVerified:false as const,
    usdValue6:null,usdPriceAuthority:'UNVERIFIED' as const,
    authoritativeDailyUsdLoss:false as const,riskExecutable:false as const,
  });
}
