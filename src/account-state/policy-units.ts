/** Converts raw MarginBank collateral to USD6 only with a separately attested,
 * block-matched collateral token identity, decimals and USD price.
 * Does not obtain or authenticate an oracle itself. Result is NOT executable proof.
 */
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
type CollateralQuote={
  chainId:number;collateralAddress:string;collateralDecimals:number;
  collateralPriceUsd6:bigint;asOfBlock:bigint;provenance:string;
};

export function convertVerifiedPerformanceToUsd6(input:{
  chainId:number;accountBlock:bigint;expectedCollateralAddress:string;
  equityRaw:bigint;dailyPnlRaw:bigint;quote:CollateralQuote;
}){
  const {quote}=input;
  if(input.chainId!==50383||quote?.chainId!==50383)throw Error('WRONG_CHAIN');
  if(!ADDRESS.test(input.expectedCollateralAddress)||!ADDRESS.test(quote.collateralAddress)||
    quote.collateralAddress.toLowerCase()!==input.expectedCollateralAddress.toLowerCase())throw Error('COLLATERAL_MISMATCH');
  if(typeof input.accountBlock!=='bigint'||input.accountBlock<0n||
    quote.asOfBlock!==input.accountBlock)throw Error('STALE_COLLATERAL_PRICE');
  if(quote.provenance!=='INDEPENDENT_ORACLE_COLLATERAL_QUOTE')throw Error('UNVERIFIED_COLLATERAL_PRICE');
  if(!Number.isSafeInteger(quote.collateralDecimals)||quote.collateralDecimals<0||quote.collateralDecimals>36)throw Error('INVALID_DECIMALS');
  if(typeof quote.collateralPriceUsd6!=='bigint'||quote.collateralPriceUsd6<=0n)throw Error('INVALID_COLLATERAL_PRICE');
  if(typeof input.equityRaw!=='bigint'||typeof input.dailyPnlRaw!=='bigint')throw Error('INVALID_PERFORMANCE');
  const divisor=10n**BigInt(quote.collateralDecimals);
  const equityUsd6=input.equityRaw>=0n?
    input.equityRaw*quote.collateralPriceUsd6/divisor:
    -((-input.equityRaw*quote.collateralPriceUsd6+divisor-1n)/divisor);
  const pnlUsd6=input.dailyPnlRaw>=0n?
    input.dailyPnlRaw*quote.collateralPriceUsd6/divisor:
    -((-input.dailyPnlRaw*quote.collateralPriceUsd6+divisor-1n)/divisor);
  return Object.freeze({equityUsd6:equityUsd6.toString(),dailyPnlUsd6:pnlUsd6.toString(),
    asOfBlock:input.accountBlock,collateralAddress:quote.collateralAddress,
    provenance:'CALCULATED_FROM_EXTERNAL_QUOTE' as const,
    /** An input field named provenance is not independent cryptographic evidence. */
    riskExecutable:false as const});
}
