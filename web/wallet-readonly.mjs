// Read-only browser wallet observation and deliberately non-executable draft.
// No transaction, signature, authorization, or network write RPC is used here.
export const HIDEKI_CHAIN_ID = 50383;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x[0-9a-fA-F]+$/;

function nativeUnits(raw) {
  if (typeof raw !== 'string' || !HEX.test(raw)) throw new Error('INVALID_BALANCE');
  const amount = BigInt(raw);
  const whole = amount / 10n ** 18n;
  const fraction = (amount % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '').slice(0, 6);
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export async function readWalletSnapshot(provider, requestPermission = false) {
  if (!provider || typeof provider.request !== 'function') throw new Error('WALLET_UNAVAILABLE');
  const accounts = await provider.request({ method: requestPermission ? 'eth_requestAccounts' : 'eth_accounts' });
  if (!Array.isArray(accounts) || !ADDRESS.test(accounts[0] ?? '')) throw new Error('WALLET_NOT_CONNECTED');
  const address = accounts[0];
  const rawChain = await provider.request({ method: 'eth_chainId' });
  if (typeof rawChain !== 'string' || !HEX.test(rawChain)) throw new Error('INVALID_CHAIN');
  const chainId = Number(BigInt(rawChain));
  if (chainId !== HIDEKI_CHAIN_ID) throw new Error('WRONG_CHAIN');
  const rawBalance = await provider.request({ method: 'eth_getBalance', params: [address, 'latest'] });
  return Object.freeze({ address, chainId, nativeBalance: nativeUnits(rawBalance), observedAt: new Date().toISOString() });
}

export function buildUnsignedDraft({ wallet, intent, policy, decision }) {
  if (!wallet || !ADDRESS.test(wallet.address ?? '') || wallet.chainId !== HIDEKI_CHAIN_ID || typeof wallet.nativeBalance !== 'string' || !wallet.observedAt) {
    throw new Error('WALLET_NOT_VERIFIED');
  }
  const ageMs = Date.now() - Date.parse(wallet.observedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 5 * 60 * 1000) throw new Error('WALLET_READ_STALE');
  if (!decision || !['ALLOW', 'RESIZE'].includes(decision.decision) || !Number.isSafeInteger(decision.approvedNotional) || decision.approvedNotional <= 0) {
    throw new Error('POLICY_BLOCKED');
  }
  return {
    schema: 'tradefirewall.unsigned-simulation-draft.v1',
    status: 'UNSIGNED_SIMULATION_DRAFT',
    authority: 'HYPOTHETICAL_POLICY_ONLY',
    account: wallet.address,
    chainId: wallet.chainId,
    walletObservationTime: wallet.observedAt ?? null,
    createdAt: new Date().toISOString(),
    intent: { ...intent },
    policy: { ...policy, markets: [...policy.markets ?? []] },
    simulatedDecision: { ...decision, reasons: [...decision.reasons ?? []] },
    approvedNotional: decision.approvedNotional,
    networkExecution: false,
    walletSigned: false,
    orderSubmitted: false,
    transactionHashes: [],
    limitations: 'Native balance is gas-only context, not collateral/equity. Policy inputs are hypothetical. Not executable calldata or an order authorization.',
  };
}
