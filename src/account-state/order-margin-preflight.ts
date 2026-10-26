/** Read-only SDK order admission; never substitutes for account daily-loss authority. */
type Address=`0x${string}`;
type Request={pool:Address;marginBank:Address;account:Address;isBid:boolean;quantity:bigint;price:bigint;expectedBlock:bigint};
type MarginClient={previewPerpOrderMargin?(order:Omit<Request,'expectedBlock'>):Promise<unknown>};
const address=/^0x[0-9a-fA-F]{40}$/;

export function createOrderMarginPreflight(deps:{readChainId():Promise<number>;client:MarginClient}) {
  return Object.freeze({
    async check(order:Request) {
      if (![order?.pool,order?.marginBank,order?.account].every(a=>typeof a==='string'&&address.test(a)) ||
          typeof order?.isBid!=='boolean'||typeof order?.quantity!=='bigint'||order.quantity<=0n ||
          typeof order?.price!=='bigint'||order.price<=0n||typeof order?.expectedBlock!=='bigint'||order.expectedBlock<0n) {
        throw new Error('INVALID_ORDER');
      }
      if(await deps.readChainId()!==50383) throw new Error('WRONG_CHAIN');
      if(typeof deps.client?.previewPerpOrderMargin!=='function') throw new Error('SDK_MARGIN_NOT_VERIFIED');
      const {pool,marginBank,account,isBid,quantity,price}=order;
      const raw=await deps.client.previewPerpOrderMargin({pool,marginBank,account,isBid,quantity,price});
      if(!raw||typeof raw!=='object') throw new Error('SDK_MARGIN_NOT_VERIFIED');
      const q=raw as Record<string,unknown>;
      if(q.priceable!==true||typeof q.asOfBlock!=='bigint'||q.asOfBlock!==order.expectedBlock||
         q.sufficient!==true||q.hasCollateralForLock!==true||q.meetsInitialMargin!==true||
         q.voucherBlocked!==false||q.restrictedBlocked!==false||q.isolationBlocked!==false) {
        throw new Error('SDK_MARGIN_NOT_VERIFIED');
      }
      return Object.freeze({asOfBlock:order.expectedBlock,admission:'SDK_MARGIN_PASSED' as const,
        readyForTrading:false as const,reason:'DAILY_LOSS_AND_PERMISSION_STILL_REQUIRE_INDEPENDENT_VERIFICATION' as const});
    },
  });
}
