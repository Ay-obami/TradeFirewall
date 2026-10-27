/** Economic classification of the 18 public MarginBank event fragments in
 * @somnia-chain/markets-sdk@0.32.1. This is NOT a raw-log decoder or USD PnL
 * authority; the SDK omits the voucher-program events known on Hideki.
 *
 * `external_transfer` means a cross-boundary account equity adjustment candidate,
 * NOT proof that its value can be subtracted from a daily equity delta. In
 * particular PositionTransferred carries collateral along with risk exposure.
 * No trading event may be subtracted as if it were a deposit or withdrawal.
 */
export type BankEventCategory='external_transfer'|'trading'|'internal_collateral'|'ignored';
type Direction=-1|1;
type Spec={category:BankEventCategory;amountField:string|null;transferRoles:Readonly<Record<string,Direction>>};
const empty=Object.freeze({});
const trading=(field:string|null=null):Spec=>({category:'trading',amountField:field,transferRoles:empty});
const ignored:Spec={category:'ignored',amountField:null,transferRoles:empty};
const internal:Spec={category:'internal_collateral',amountField:'amount',transferRoles:empty};
const transfer=(field:string,roles:Record<string,Direction>):Spec=>({category:'external_transfer',amountField:field,transferRoles:Object.freeze(roles)});

const specs={
  PositionUpdated:trading(),
  FundingSettled:trading('payment'), // signed; positive means the account pays
  Deposited:transfer('amount',{account:1}),
  DepositedFor:transfer('amount',{account:1}),
  Withdrawn:transfer('amount',{account:-1}),
  CollateralLocked:internal,
  CollateralUnlocked:internal,
  FeeCharged:trading('amount'), // insurancePortion is included in amount
  RebatePaid:trading('amount'),
  AutoDeleveraged:trading(),
  CloseOutMarginSettled:transfer('amount',{from:-1,to:1}),
  BadDebtAbsorbed:trading('covered'), // badDebt is a level, not another flow
  PositionTransferred:transfer('collateralTransferred',{from:-1,to:1}),
  LiquidationOrderPanicked:ignored,
  MainFundedChild:transfer('amount',{child:1,payer:-1}), // outstandingPrincipal is a level
  IsolatedModeSet:ignored,
  MaxLeverageSet:ignored,
  BuilderFeeCharged:trading('amount'),
} as const satisfies Record<string,Spec>;

export const SDK_MARGIN_BANK_EVENT_NAMES=Object.freeze(Object.keys(specs));

export function classifyBankEvent(name:string):Spec {
  if(!Object.hasOwn(specs,name))throw Error('UNCLASSIFIED_BANK_EVENT');
  return specs[name as keyof typeof specs];
}
