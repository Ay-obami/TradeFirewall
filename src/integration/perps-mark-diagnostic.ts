/** Read-only actual Perps mark diagnostics. Same-call SDK atomicity is not a
 * cross-component block attestation and MUST NOT issue a trading risk proof. */
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
type State={markPrice:bigint;markPriceOk:boolean;indexPrice:bigint;indexUpdatedAt:bigint;oracle:string};
type Feed={markPriceOk?:boolean;markPrice?:bigint;markUpdatedAt?:bigint;indexUpdatedAt?:bigint};
type Client={getPerpState:(pool:`0x${string}`)=>Promise<State>;getPerpFeedStatus:(pool:`0x${string}`)=>Promise<Feed>};
export async function readPerpsMarkDiagnostic(input:{client:Client;pool:string;nowSec:bigint;maxIndexAgeSec?:bigint}){
 if(!ADDRESS.test(input.pool)||typeof input.nowSec!=='bigint'||input.nowSec<0n)throw Error('INVALID_MARK_CONTEXT');
 const maxAge=input.maxIndexAgeSec??120n;
 if(typeof maxAge!=='bigint'||maxAge<=0n)throw Error('INVALID_MARK_AGE_LIMIT');
 const [state,feed]=await Promise.all([input.client.getPerpState(input.pool as `0x${string}`),input.client.getPerpFeedStatus(input.pool as `0x${string}`)]);
 if(!state||typeof state.markPrice!=='bigint'||typeof state.indexPrice!=='bigint'||typeof state.indexUpdatedAt!=='bigint'||typeof state.markPriceOk!=='boolean'||!ADDRESS.test(state.oracle)||!feed||typeof feed!=='object')throw Error('MALFORMED_PERP_MARK');
 const usable=state.markPriceOk&&state.markPrice>0n&&state.indexPrice>0n&&state.indexUpdatedAt<=input.nowSec&&input.nowSec-state.indexUpdatedAt<=maxAge&&(feed.markPriceOk===undefined||feed.markPriceOk===true);
 return Object.freeze({mode:'LIVE_MARK_DIAGNOSTIC' as const,pool:input.pool,oracle:state.oracle,markPriceRaw:usable?state.markPrice.toString():null,indexPriceRaw:state.indexPrice.toString(),indexUpdatedAt:state.indexUpdatedAt.toString(),usableAsDiagnostic:usable,blockPinnedAcrossReaders:false as const,riskExecutable:false as const,reason:usable?'MARK_HEALTHY_NOT_CROSS_READER_ATTESTED':'MARK_STALE_OR_UNPRICEABLE'});
}
