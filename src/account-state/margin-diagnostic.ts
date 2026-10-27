/**
 * A real, read-only SDK MarginBank observation. The SDK pins one margin-account
 * call internally and exposes its asOfBlock. A height alone cannot establish
 * a block hash or cross-call atomicity, so this advisory result MUST NOT
 * authorize an order or be joined to independent reads as one snapshot.
 */
type Address=`0x${string}`;
const address=/^0x[0-9a-fA-F]{40}$/;

export interface MarginDiagnosticSdk {
  getMarginAccount?(marginBank:Address,account:Address):Promise<unknown>;
}

export function createMarginDiagnostic(deps:{client:MarginDiagnosticSdk;readChainId():Promise<number>}) {
  return Object.freeze({
    async read({account,marginBank}:{account:Address;marginBank:Address}) {
      if (!address.test(account)||!address.test(marginBank)) throw new Error('INVALID_ADDRESS');
      if (await deps.readChainId()!==50383) throw new Error('WRONG_CHAIN');
      if (typeof deps.client?.getMarginAccount!=='function') throw new Error('MISSING_SDK_METHOD');
      const raw=await deps.client.getMarginAccount(marginBank,account);
      if (!raw||typeof raw!=='object') throw new Error('INVALID_MARGIN_ACCOUNT');
      const state=raw as Record<string,unknown>;
      const signed=['unlockedCollateralBalance','equity'];
      const unsigned=['lockedCollateral','withdrawable','imReq','mmReq','cmReq'];
      if (signed.some(k=>typeof state[k]!=='bigint') ||
          unsigned.some(k=>typeof state[k]!=='bigint'||(state[k] as bigint)<0n) ||
          typeof state.asOfBlock!=='bigint'||(state.asOfBlock as bigint)<0n ||
          !Array.isArray(state.activePerpPools) ||
          state.activePerpPools.some((pool:unknown)=>typeof pool!=='string'||!address.test(pool)) ||
          typeof state.marginStatus!=='string'||state.marginStatus.length===0) {
        throw new Error('INVALID_MARGIN_ACCOUNT');
      }
      return Object.freeze({
        chainId:50383 as const,account,marginBank,
        asOfBlock:state.asOfBlock as bigint,
        unlockedCollateralBalance:state.unlockedCollateralBalance as bigint,
        lockedCollateral:state.lockedCollateral as bigint,
        activePerpPools:Object.freeze([...(state.activePerpPools as Address[])]),
        equity:state.equity as bigint,
        withdrawable:state.withdrawable as bigint,
        imReq:state.imReq as bigint,mmReq:state.mmReq as bigint,cmReq:state.cmReq as bigint,
        marginStatus:state.marginStatus,
        authority:'ADVISORY_ONLY' as const,
        blockPinScope:'SDK_INTERNAL_SINGLE_CALL' as const,
        riskExecutable:false as const,
      });
    },
  });
}
