/**
 * Read-only voucher diagnostic using the official dreamDEX Markets SDK method.
 * Eligibility is not a margin, balance, PnL or block-pinned risk observation.
 */
type Address=`0x${string}`;
const address=/^0x[0-9a-fA-F]{40}$/;

export interface VoucherSdkClient {
  getPerpVoucherEligibility?(marginBank:Address, account:Address):Promise<{eligible:unknown}>;
}

export function createVoucherPreflight(deps:{
  client:VoucherSdkClient;
  readChainId():Promise<number>;
}) {
  return Object.freeze({
    async read({account,marginBank}:{account:Address;marginBank:Address}) {
      if (!address.test(account) || !address.test(marginBank)) throw new Error('INVALID_ADDRESS');
      if (await deps.readChainId()!==50383) throw new Error('WRONG_CHAIN');
      if (typeof deps.client?.getPerpVoucherEligibility!=='function') throw new Error('MISSING_SDK_METHOD');
      const eligibility=await deps.client.getPerpVoucherEligibility(marginBank,account);
      if (typeof eligibility?.eligible!=='boolean') throw new Error('INVALID_ELIGIBILITY');
      return Object.freeze({account,marginBank,chainId:50383 as const,eligible:eligibility.eligible,authority:'ADVISORY_ONLY' as const});
    },
  });
}
